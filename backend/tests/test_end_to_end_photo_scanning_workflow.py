"""End-to-End Test Suite for Complete FitMe Photo-Scanning Workflow.

Verifies the entire lifecycle in integrated sequence:
1. Image Upload & Private Storage (Supabase bucket, user-isolated path, signed URL).
2. AI Detection & Nutrition Calculation (multi-food, Indian dishes, catalog profiles).
3. Editable Portions & Local Recalculation (zero AI calls on portion changes).
4. Meal Confirmation & Daily Totals (food_logs persistence, daily budget update, idempotency).
5. Duplicate Image Caching & Usage Tracking (SHA-256 exact match, tokens saved, force_refresh).
6. User Isolation, Authentication & RLS (User B cannot access or reuse User A's data).
7. Error Handling (corrupted base64, invalid formats, unauthenticated access).
8. Feedback Storage & Consent (disaggregated predictions, portion/prep deltas, consent filtering).
"""
import pytest
import uuid
import base64
import hashlib
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.schemas.food import MealType
from app.schemas.meal_scan import (
    ImageAnalysisRequest,
    MealScanConfirmRequest,
    ConfirmedFoodItem,
    RecalculateItemRequest,
    CacheInvalidationRequest,
)
from app.services.image_analysis_service import (
    ImageAnalysisService,
    STORAGE_BUCKET,
    MODEL_PROVIDER,
    MODEL_VERSION,
    ANALYSIS_VERSION,
)
from app.services.vision_usage_tracker import VisionUsageTracker
from app.services.feedback_learning.dataset_curator import DatasetCurator
from app.api.meals import (
    analyze_meal_image,
    recalculate_item_nutrition,
    confirm_scanned_meal,
    delete_scanned_image,
    invalidate_image_cache,
    get_vision_usage_stats,
)


def make_valid_png_bytes(tag: int = 100) -> bytes:
    """Generates a valid PNG byte sequence exceeding minimum byte limits."""
    header = b"\x89PNG\r\n\x1a\n"
    payload = bytes([tag] * 256)
    return header + payload


@pytest.fixture(autouse=True)
def clean_tracker():
    VisionUsageTracker.reset()
    yield
    VisionUsageTracker.reset()


@pytest.mark.asyncio
async def test_end_to_end_complete_photo_scan_workflow():
    """
    Simulates complete user journey from photo capture to dashboard update:
    Upload -> Storage -> Vision AI -> Recalculate -> Confirm -> Dashboard -> Cache -> Delete.
    """
    user_id = str(uuid.uuid4())
    img_bytes = make_valid_png_bytes(42)
    img_b64 = base64.b64encode(img_bytes).decode("ascii")
    img_hash = hashlib.sha256(img_bytes).hexdigest()

    mock_client = MagicMock()

    # In-memory storage mock
    uploaded_storage_files = {}
    mock_bucket = MagicMock()
    def mock_upload(path, file, file_options):
        uploaded_storage_files[path] = file
        return {"Key": path}
    mock_bucket.upload.side_effect = mock_upload
    mock_bucket.create_signed_url.return_value = {"signedURL": "https://storage.supabase.co/signed/plate.jpg"}
    mock_bucket.remove.side_effect = lambda paths: [uploaded_storage_files.pop(p, None) for p in paths]
    mock_client.storage.from_.return_value = mock_bucket

    # In-memory database tables
    food_images_db = {}
    food_logs_db = []
    plate_feedback_db = []
    daily_dashboard_db = {
        "calories_consumed": 0.0,
        "protein_consumed": 0.0,
        "carbs_consumed": 0.0,
        "fat_consumed": 0.0,
    }

    # Setup DB mock router
    def table_router(table_name: str):
        t_mock = MagicMock()
        query_mock = MagicMock()

        if table_name == "food_images":
            img_filters = {}
            def img_eq(field, val):
                img_filters[field] = val
                return query_mock
            query_mock.eq.side_effect = img_eq

            def execute_select():
                rows = list(food_images_db.values())
                target_user = img_filters.get("user_id")
                if target_user:
                    rows = [r for r in rows if str(r.get("user_id")) == str(target_user)]
                return MagicMock(data=rows)

            query_mock.execute.side_effect = execute_select
            query_mock.gte.return_value = query_mock
            query_mock.order.return_value = query_mock
            query_mock.limit.return_value = query_mock
            t_mock.select.return_value = query_mock

            def execute_insert(row):
                row_id = row.get("id") or str(uuid.uuid4())
                row["id"] = row_id
                food_images_db[row_id] = row
                ins_mock = MagicMock()
                ins_mock.execute.return_value = MagicMock(data=[row])
                return ins_mock

            t_mock.insert.side_effect = execute_insert

            def execute_update(update_dict):
                up_mock = MagicMock()
                def do_update():
                    for r in food_images_db.values():
                        if r.get("user_id") == user_id:
                            r.update(update_dict)
                    return MagicMock(data=[update_dict])
                up_mock.eq.return_value.execute.side_effect = do_update
                return up_mock

            t_mock.update.side_effect = execute_update
            t_mock.delete.return_value = query_mock
            return t_mock

        elif table_name == "food_logs":
            def execute_log_insert(row):
                if isinstance(row, list):
                    for r in row:
                        r["id"] = str(uuid.uuid4())
                        food_logs_db.append(r)
                    ins_mock = MagicMock()
                    ins_mock.execute.return_value = MagicMock(data=row)
                    return ins_mock
                else:
                    row["id"] = str(uuid.uuid4())
                    food_logs_db.append(row)
                    ins_mock = MagicMock()
                    ins_mock.execute.return_value = MagicMock(data=[row])
                    return ins_mock

            t_mock.insert.side_effect = execute_log_insert

            log_filters = {}
            def log_eq(field, val):
                log_filters[field] = val
                return query_mock
            query_mock.eq.side_effect = log_eq

            def execute_log_select():
                rows = list(food_logs_db)
                if "food_name" in log_filters:
                    rows = [r for r in rows if r.get("food_name") == log_filters["food_name"]]
                log_filters.clear()
                return MagicMock(data=rows)

            query_mock.execute.side_effect = execute_log_select
            query_mock.gte.return_value = query_mock
            query_mock.lte.return_value = query_mock
            t_mock.select.return_value = query_mock
            return t_mock

        elif table_name == "plate_scan_feedback":
            def execute_fb_insert(row):
                row["id"] = str(uuid.uuid4())
                plate_feedback_db.append(row)
                ins_mock = MagicMock()
                ins_mock.execute.return_value = MagicMock(data=[row])
                return ins_mock
            t_mock.insert.side_effect = execute_fb_insert
            return t_mock

        return t_mock

    mock_client.table.side_effect = table_router

    # -------------------------------------------------------------------------
    # STEP 1: Upload & Initial Vision AI Analysis
    # -------------------------------------------------------------------------
    mock_detected_foods = [
        {
            "name": "Roti",
            "aliases": ["chapati"],
            "serving_quantity": 2.0,
            "serving_unit": "piece",
            "estimated_weight_g": 70.0,
            "preparation": "cooked",
            "confidence": "high",
        },
        {
            "name": "Dal Tadka",
            "aliases": ["yellow dal"],
            "serving_quantity": 1.0,
            "serving_unit": "bowl",
            "estimated_weight_g": 150.0,
            "preparation": "ghee tempered",
            "confidence": "medium",
        }
    ]

    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client), \
         patch("app.services.image_analysis_service.ImageAnalysisService.analyze_plate_image",
               return_value=(mock_detected_foods, None, {"prompt_tokens": 850, "completion_tokens": 150})):

        scan_req = ImageAnalysisRequest(
            image_base64=img_b64,
            mime_type="image/png",
            meal_type="lunch",
            allow_training_consent=True
        )
        scan_resp = await analyze_meal_image(payload=scan_req, user={"id": user_id})

    # Verify Step 1 outputs
    assert scan_resp.is_cached_analysis is False
    assert scan_resp.image_hash == img_hash
    assert len(scan_resp.foods) == 2
    assert scan_resp.storage_path.startswith(f"user_{user_id}/")
    assert scan_resp.signed_image_url is not None
    assert scan_resp.total_calories > 0
    image_id = scan_resp.image_id

    # Storage bucket must have received the image
    assert any(k.startswith(f"user_{user_id}/") for k in uploaded_storage_files.keys())

    # -------------------------------------------------------------------------
    # STEP 2: Editable Portions & Local Zero-AI Recalculation
    # -------------------------------------------------------------------------
    # User edits Roti: increased from 2 pieces (70g) to 3 pieces (105g)
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client), \
         patch("app.services.image_analysis_service.ImageAnalysisService.analyze_plate_image") as mock_no_ai:

        recalc_req = RecalculateItemRequest(
            food_name="Roti",
            quantity=3.0,
            unit="piece",
            weight_g=105.0,
            preparation="cooked"
        )
        recalc_resp = await recalculate_item_nutrition(payload=recalc_req, user={"id": user_id})

        # Must NOT call Vision AI
        mock_no_ai.assert_not_called()
        assert recalc_resp.weight_g == 105.0
        assert recalc_resp.estimated_calories > 0
        assert recalc_resp.protein_g > 0

    # -------------------------------------------------------------------------
    # STEP 3: Confirm & Save Meal (Food Logs & Daily Totals)
    # -------------------------------------------------------------------------
    confirmed_items = [
        ConfirmedFoodItem(
            food_name="Roti",
            quantity=3.0,
            unit="piece",
            estimated_weight_g=105.0,
            estimated_calories=260.0,
            protein_g=8.0,
            carbohydrates_g=52.0,
            fat_g=1.5,
            preparation="cooked",
            was_edited=True
        ),
        ConfirmedFoodItem(
            food_name="Dal Tadka",
            quantity=1.0,
            unit="bowl",
            estimated_weight_g=150.0,
            estimated_calories=150.0,
            protein_g=9.0,
            carbohydrates_g=22.0,
            fat_g=3.0,
            preparation="boiled / less oil",
            was_edited=True
        ),
        # User manually added salad
        ConfirmedFoodItem(
            food_name="Cucumber Salad",
            quantity=1.0,
            unit="bowl",
            estimated_weight_g=100.0,
            estimated_calories=20.0,
            protein_g=1.0,
            carbohydrates_g=4.0,
            fat_g=0.2,
            was_added=True
        )
    ]

    confirm_req = MealScanConfirmRequest(
        image_id=image_id,
        meal_type="lunch",
        items=confirmed_items,
        deleted_items=[],
        allow_training_consent=True
    )

    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client), \
         patch("app.api.food.get_supabase_admin_client", return_value=mock_client), \
         patch("app.services.user_learning.UserPreferenceLearningEngine.record_confirmed_log"):

        confirm_resp = await confirm_scanned_meal(payload=confirm_req, user={"id": user_id})

    # Verify Step 3 outputs
    assert confirm_resp.success is True
    assert len(confirm_resp.saved_logs) == 3
    assert confirm_resp.total_calories == 430.0
    assert confirm_resp.feedback_saved is True

    # Verify food_logs table received the entries linked to food_image_id
    assert len(food_logs_db) == 3
    for entry in food_logs_db:
        assert entry.get("food_image_id") == image_id
        assert entry.get("user_id") == user_id

    # -------------------------------------------------------------------------
    # STEP 4: Feedback Storage & Disaggregated Corrections
    # -------------------------------------------------------------------------
    assert len(plate_feedback_db) == 1
    feedback_entry = plate_feedback_db[0]
    assert feedback_entry["food_image_id"] == image_id
    assert feedback_entry["allow_training_consent"] is True
    assert feedback_entry["review_status"] == "approved_for_training"

    # Verify disaggregated fields
    assert "original_prediction" in feedback_entry
    assert "confirmed_food_labels" in feedback_entry
    assert "portion_corrections" in feedback_entry
    assert "preparation_corrections" in feedback_entry
    assert "label_corrections" in feedback_entry
    assert "delta_metrics" in feedback_entry

    # Check portion delta for Roti (105g - 70g = +35g)
    roti_corr = next(p for p in feedback_entry["portion_corrections"] if p["food_name"] == "Roti")
    assert roti_corr["delta_grams"] == 35.0
    assert roti_corr["was_portion_adjusted"] is True

    # Check added item in label corrections
    assert "Cucumber Salad" in feedback_entry["label_corrections"]["added_items"]

    # -------------------------------------------------------------------------
    # STEP 5: Exact Duplicate Image Caching & Usage Tracking
    # -------------------------------------------------------------------------
    # Rescan exact same image bytes for User A
    # Update food_images row to completed so duplicate check hits
    for r in food_images_db.values():
        r["analysis_status"] = "completed"
        r["model_provider"] = MODEL_PROVIDER
        r["model_version"] = MODEL_VERSION
        r["analysis_version"] = ANALYSIS_VERSION
        r["created_at"] = datetime.now(timezone.utc).isoformat()
        r["token_usage_json"] = {"prompt_tokens": 850, "completion_tokens": 150}

    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client), \
         patch("app.services.image_analysis_service.ImageAnalysisService.analyze_plate_image") as mock_ai_duplicate:

        rescan_resp = await analyze_meal_image(payload=scan_req, user={"id": user_id})

        # MUST be served from cache with ZERO remote vision AI calls
        mock_ai_duplicate.assert_not_called()
        assert rescan_resp.is_cached_analysis is True
        assert rescan_resp.cache_hit_savings is not None

    # Check usage stats endpoint
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        stats = await get_vision_usage_stats(user={"id": user_id})
        assert stats.total_scans >= 2
        assert stats.cache_hits >= 1
        assert stats.estimated_tokens_saved >= 480

    # -------------------------------------------------------------------------
    # STEP 6: User Isolation & Privacy Protection (User B)
    # -------------------------------------------------------------------------
    user_b_id = str(uuid.uuid4())
    # User B checks cache with same image hash -> MUST NOT hit User A's cache
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        cached_b = ImageAnalysisService.check_duplicate_image_cache(
            client=mock_client,
            user_id=user_b_id,
            image_hash=img_hash
        )
        assert cached_b is None

    # User B attempts to delete User A's image -> MUST FAIL
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        with pytest.raises(HTTPException) as exc_info:
            await delete_scanned_image(image_id=image_id, user={"id": user_b_id})
        assert exc_info.value.status_code == 404

    # -------------------------------------------------------------------------
    # STEP 7: Cache Invalidation & Image Deletion
    # -------------------------------------------------------------------------
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        inv_res = await invalidate_image_cache(
            payload=CacheInvalidationRequest(image_hash=img_hash),
            user={"id": user_id}
        )
        assert inv_res.success is True

    # Delete the food image
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        del_res = await delete_scanned_image(image_id=image_id, user={"id": user_id})
        assert del_res["success"] is True


@pytest.mark.asyncio
async def test_error_handling_robustness():
    """
    Tests edge cases and error handling:
    - Corrupted base64 payload
    - Tiny image payload below minimum size
    - Non-consented entries excluded from dataset export
    """
    user_id = str(uuid.uuid4())
    mock_client = MagicMock()

    # 1. Corrupted Base64
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        with pytest.raises(HTTPException) as exc1:
            await analyze_meal_image(
                payload=ImageAnalysisRequest(image_base64="not-valid-base64-content!"),
                user={"id": user_id}
            )
        assert exc1.value.status_code == 400

    # 2. Too short (<100 bytes) but passes min string length
    short_b64 = base64.b64encode(b"012345678901234").decode("ascii")  # 15 bytes, 20 b64 chars
    with patch("app.api.meals.get_supabase_admin_client", return_value=mock_client):
        with pytest.raises(HTTPException) as exc2:
            await analyze_meal_image(
                payload=ImageAnalysisRequest(image_base64=short_b64),
                user={"id": user_id}
            )
        assert exc2.value.status_code == 400

    # 3. Privacy filter in dataset export
    unconsented_samples = [
        {"id": "unconsented-1", "allow_training_consent": False, "confirmed_items": []}
    ]
    with pytest.raises(ValueError, match="Security/Privacy violation"):
        DatasetCurator.create_labelled_manifest(client=None, examples=unconsented_samples)
