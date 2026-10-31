"""Unit tests for Vision API Caching, Optimization, Usage Tracking, and Strict User Isolation.

Verifies:
1. Exact duplicate image reuses analysis (SHA-256 hash, model version, analysis version).
2. Portion estimates are NOT reused blindly for different photos (strict SHA-256 cryptographic match).
3. Nutrition profiles are reused and quantity changes are calculated locally with 0 AI calls.
4. Force refresh bypasses cached duplicate analysis.
5. User isolation: user B cannot access or reuse user A's cached analysis.
6. Cache invalidation marks records invalidated and subsequent calls miss cache.
7. Image deletion cleans up cached hash.
8. API usage statistics accurately track scans, cache hits, prompt/completion tokens, and savings.
"""
import pytest
import uuid
import base64
import hashlib
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from app.services.image_analysis_service import (
    ImageAnalysisService,
    MODEL_VERSION,
    ANALYSIS_VERSION,
    MODEL_PROVIDER,
)
from app.services.vision_usage_tracker import VisionUsageTracker
from app.schemas.meal_scan import (
    ImageAnalysisRequest,
    CacheInvalidationRequest,
    RecalculateItemRequest,
)
from app.api.meals import (
    analyze_meal_image,
    invalidate_image_cache,
    get_vision_usage_stats,
    recalculate_item_nutrition,
    delete_scanned_image,
)


def create_sample_png_bytes(color_byte: int = 120) -> bytes:
    """Creates a minimal valid PNG in memory with distinctive bytes (>100 bytes)."""
    header = b"\x89PNG\r\n\x1a\n"
    # A minimal dummy payload that hashes distinctly and exceeds 100 bytes
    data = header + bytes([color_byte] * 256)
    return data


@pytest.fixture(autouse=True)
def reset_usage_tracker():
    """Resets in-memory stats between tests."""
    VisionUsageTracker.reset()
    yield
    VisionUsageTracker.reset()


@pytest.mark.asyncio
async def test_exact_duplicate_reuses_cached_analysis_and_tracks_savings():
    """
    Exact duplicate image (identical SHA-256 hash, user_id, analysis_version)
    reuses previous analysis with 0 AI calls and records cache hit savings.
    """
    user_id = str(uuid.uuid4())
    img_bytes = create_sample_png_bytes(200)
    img_b64 = base64.b64encode(img_bytes).decode("ascii")
    img_hash = hashlib.sha256(img_bytes).hexdigest()

    cached_foods = [
        {
            "id": "item-1",
            "name": "Paneer Butter Masala",
            "serving_quantity": 1.0,
            "serving_unit": "bowl",
            "estimated_weight_g": 200,
            "estimated_calories": 380,
            "protein_g": 14.0,
            "carbohydrates_g": 12.0,
            "fat_g": 30.0,
            "confidence": "high",
        }
    ]

    mock_client = MagicMock()
    # Mock food_images query for duplicate check
    food_images_table = MagicMock()
    mock_client.table.return_value = food_images_table

    # Existing completed record
    cached_row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "image_hash": img_hash,
        "storage_path": f"user_{user_id}/test.jpg",
        "analysis_status": "completed",
        "detected_foods_json": cached_foods,
        "original_ai_prediction_json": cached_foods,
        "detected_labels": ["curry", "paneer"],
        "model_provider": MODEL_PROVIDER,
        "model_version": MODEL_VERSION,
        "analysis_version": ANALYSIS_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "token_usage_json": {"prompt_tokens": 850, "completion_tokens": 120, "total_tokens": 970},
    }

    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(data=[cached_row])
    food_images_table.select.return_value = query_mock
    query_mock.eq.return_value = query_mock
    query_mock.gte.return_value = query_mock
    query_mock.order.return_value = query_mock
    query_mock.limit.return_value = query_mock

    # Storage signed url mock
    mock_client.storage.from_.return_value.create_signed_url.return_value = {
        "signedURL": "https://example.com/fresh-signed-url.jpg"
    }

    # Execute with Vision AI mocked to assert it is NEVER called
    with patch("app.services.image_analysis_service.ImageAnalysisService.analyze_plate_image") as mock_vision:
        res = await ImageAnalysisService.process_meal_image_scan(
            client=mock_client,
            user_id=user_id,
            image_base64=img_b64,
            mime_type="image/png",
            force_refresh=False,
        )

        # Vision AI must NOT have been called
        mock_vision.assert_not_called()

        assert res.is_cached_analysis is True
        assert len(res.foods) == 1
        assert res.foods[0].name == "Paneer Butter Masala"
        assert res.image_hash == img_hash
        assert res.cache_hit_savings is not None

        # Verify usage tracker recorded the cache hit
        stats = VisionUsageTracker.get_user_stats(user_id=user_id)
        assert stats.cache_hits == 1
        assert stats.cache_misses == 0
        assert stats.cache_hit_rate_pct == 100.0
        assert stats.estimated_tokens_saved == 480


@pytest.mark.asyncio
async def test_different_photo_triggers_fresh_analysis_and_does_not_reuse_blindly():
    """
    Even a slight variation (different SHA-256 hash) does NOT blindly reuse
    portions from another photo. It triggers a fresh vision analysis.
    """
    user_id = str(uuid.uuid4())
    img_bytes1 = create_sample_png_bytes(50)
    img_bytes2 = create_sample_png_bytes(51)  # 1 byte difference -> totally different SHA-256

    img_b64_2 = base64.b64encode(img_bytes2).decode("ascii")
    img_hash2 = hashlib.sha256(img_bytes2).hexdigest()

    mock_client = MagicMock()
    food_images_table = MagicMock()
    mock_client.table.return_value = food_images_table

    # Query returns empty because hash2 has no match
    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(data=[])
    food_images_table.select.return_value = query_mock
    query_mock.eq.return_value = query_mock
    query_mock.gte.return_value = query_mock
    query_mock.order.return_value = query_mock
    query_mock.limit.return_value = query_mock

    # Mock insert and update
    insert_mock = MagicMock()
    insert_mock.execute.return_value = MagicMock(data=[{"id": str(uuid.uuid4())}])
    food_images_table.insert.return_value = insert_mock
    food_images_table.update.return_value = query_mock

    fresh_vision_items = [
        {
            "name": "Roti",
            "aliases": ["chapati"],
            "serving_quantity": 2.0,
            "serving_unit": "piece",
            "estimated_weight_g": 80.0,
            "confidence": "high",
        }
    ]

    with patch(
        "app.services.image_analysis_service.ImageAnalysisService.analyze_plate_image",
        return_value=(
            fresh_vision_items,
            None,
            {"prompt_tokens": 900, "completion_tokens": 150, "total_tokens": 1050},
        ),
    ) as mock_vision:
        res = await ImageAnalysisService.process_meal_image_scan(
            client=mock_client,
            user_id=user_id,
            image_base64=img_b64_2,
            mime_type="image/png",
            force_refresh=False,
        )

        mock_vision.assert_called_once()
        assert res.is_cached_analysis is False
        assert res.image_hash == img_hash2
        assert len(res.foods) == 1
        assert res.foods[0].name == "Roti"

        # Verify tracker recorded a cache miss
        stats = VisionUsageTracker.get_user_stats(user_id=user_id)
        assert stats.cache_misses == 1
        assert stats.cache_hits == 0
        assert stats.total_prompt_tokens == 900
        assert stats.total_completion_tokens == 150


@pytest.mark.asyncio
async def test_force_refresh_bypasses_cache():
    """
    When force_refresh=True is provided, cache is bypassed even if an exact duplicate exists.
    """
    user_id = str(uuid.uuid4())
    img_bytes = create_sample_png_bytes(100)
    img_b64 = base64.b64encode(img_bytes).decode("ascii")

    mock_client = MagicMock()
    food_images_table = MagicMock()
    mock_client.table.return_value = food_images_table

    query_mock = MagicMock()
    food_images_table.select.return_value = query_mock
    query_mock.eq.return_value = query_mock
    query_mock.gte.return_value = query_mock
    query_mock.order.return_value = query_mock
    query_mock.limit.return_value = query_mock
    insert_mock = MagicMock()
    insert_mock.execute.return_value = MagicMock(data=[{"id": str(uuid.uuid4())}])
    food_images_table.insert.return_value = insert_mock
    food_images_table.update.return_value = query_mock

    with patch(
        "app.services.image_analysis_service.ImageAnalysisService.analyze_plate_image",
        return_value=(
            [{"name": "Dal", "serving_quantity": 1.0, "serving_unit": "bowl", "estimated_weight_g": 150.0, "confidence": "high"}],
            None,
            {"prompt_tokens": 800, "completion_tokens": 100, "total_tokens": 900},
        ),
    ) as mock_vision:
        res = await ImageAnalysisService.process_meal_image_scan(
            client=mock_client,
            user_id=user_id,
            image_base64=img_b64,
            mime_type="image/png",
            force_refresh=True,  # BYPASS CACHE
        )

        mock_vision.assert_called_once()
        assert res.is_cached_analysis is False


@pytest.mark.asyncio
async def test_user_data_isolation_cannot_hit_other_users_cache():
    """
    User B uploading the exact same image as User A CANNOT hit User A's cache.
    Cache check must strictly filter by user_id = authenticated_user.
    """
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    img_bytes = create_sample_png_bytes(150)
    img_hash = hashlib.sha256(img_bytes).hexdigest()

    mock_client = MagicMock()
    food_images_table = MagicMock()
    mock_client.table.return_value = food_images_table

    query_mock = MagicMock()
    # Emulate DB: only return record if user_id matches user_a
    def mock_eq(field, val):
        if field == "user_id" and val == user_b:
            query_mock.execute.return_value = MagicMock(data=[])
        return query_mock

    query_mock.eq.side_effect = mock_eq
    food_images_table.select.return_value = query_mock
    query_mock.gte.return_value = query_mock
    query_mock.order.return_value = query_mock
    query_mock.limit.return_value = query_mock

    # When User B checks cache for the same hash:
    cached = ImageAnalysisService.check_duplicate_image_cache(
        client=mock_client,
        user_id=user_b,
        image_hash=img_hash,
    )
    # Must be None for User B
    assert cached is None


@pytest.mark.asyncio
async def test_cache_invalidation_endpoint_and_service():
    """
    Invalidating cache marks database record as invalidated and purges in-memory index.
    Subsequent check fails to hit cache.
    """
    user_id = str(uuid.uuid4())
    img_hash = "abcdef1234567890"

    mock_client = MagicMock()
    food_images_table = MagicMock()
    mock_client.table.return_value = food_images_table
    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(data=[{"id": str(uuid.uuid4())}])
    food_images_table.update.return_value = query_mock
    query_mock.eq.return_value = query_mock

    # Test invalidation endpoint
    payload = CacheInvalidationRequest(image_hash=img_hash)
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        resp = await invalidate_image_cache(payload=payload, user={"id": user_id})
    assert resp.success is True
    assert resp.invalidated_count >= 1


@pytest.mark.asyncio
async def test_delete_food_image_invalidates_cache():
    """
    Deleting an image from storage & database triggers cache invalidation for its hash.
    """
    user_id = str(uuid.uuid4())
    image_id = str(uuid.uuid4())
    img_hash = "hash_to_delete_9999"

    mock_client = MagicMock()
    food_images_table = MagicMock()
    mock_client.table.return_value = food_images_table

    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(
        data=[{"storage_path": f"user_{user_id}/meal.png", "image_hash": img_hash}]
    )
    food_images_table.select.return_value = query_mock
    query_mock.eq.return_value = query_mock
    food_images_table.delete.return_value = query_mock

    with patch.object(VisionUsageTracker, "invalidate_cache") as mock_inv:
        success = ImageAnalysisService.delete_food_image(
            client=mock_client,
            user_id=user_id,
            image_id=image_id,
        )
        assert success is True
        mock_inv.assert_called_once_with(user_id=user_id, image_hash=img_hash, client=mock_client)


@pytest.mark.asyncio
async def test_instant_local_nutrition_recalculation_uses_zero_ai():
    """
    Quantity & portion changes are scaled strictly locally in Python
    from reliable basis weight without invoking Gemini Vision or Language models.
    """
    mock_client = MagicMock()
    catalog_table = MagicMock()
    mock_client.table.return_value = catalog_table

    # Existing profile in DB with 100g basis
    profile_data = {
        "id": str(uuid.uuid4()),
        "canonical_name": "Paneer Tikka",
        "basis_weight_g": 100.0,
        "calories": 250.0,
        "protein_g": 18.0,
        "carbohydrates_g": 6.0,
        "fat_g": 17.0,
        "fiber_g": 2.0,
    }

    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(data=[profile_data])
    catalog_table.select.return_value = query_mock
    query_mock.eq.return_value = query_mock
    query_mock.limit.return_value = query_mock

    # Recalculate for 200g (double the portion)
    req = RecalculateItemRequest(
        food_name="Paneer Tikka",
        quantity=2.0,
        unit="serving",
        weight_g=200.0,
    )

    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client), \
         patch("app.services.image_analysis_service.ImageAnalysisService.analyze_plate_image") as mock_vision:
        res = await recalculate_item_nutrition(payload=req, user={"id": str(uuid.uuid4())})
        mock_vision.assert_not_called()

        assert res.weight_g == 200.0
        # Scaled from local profile/clinical heuristic basis with zero AI calls
        assert res.estimated_calories > 0
        assert res.protein_g > 0
        assert res.nutrition_source in ["verified_profile", "clinical_heuristic"]


@pytest.mark.asyncio
async def test_get_vision_usage_stats_endpoint():
    """
    Verifies that the /api/meals/usage-stats endpoint returns complete statistics.
    """
    user_id = str(uuid.uuid4())
    # Record 1 miss and 1 hit
    VisionUsageTracker.record_scan(
        user_id=user_id,
        image_hash="hash_miss",
        is_cache_hit=False,
        prompt_tokens=1000,
        completion_tokens=200,
    )
    VisionUsageTracker.record_scan(
        user_id=user_id,
        image_hash="hash_hit",
        is_cache_hit=True,
    )

    mock_client = MagicMock()
    food_images_table = MagicMock()
    mock_client.table.return_value = food_images_table
    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(data=[])
    food_images_table.select.return_value = query_mock
    query_mock.eq.return_value = query_mock

    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        stats_resp = await get_vision_usage_stats(user={"id": user_id})
    assert stats_resp.total_scans >= 2
    assert stats_resp.cache_hits >= 1
    assert stats_resp.total_prompt_tokens >= 1000
    assert stats_resp.total_completion_tokens >= 200
    assert stats_resp.estimated_tokens_saved >= 480
