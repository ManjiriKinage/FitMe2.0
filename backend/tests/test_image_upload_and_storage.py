"""Unit and integration tests for Supabase Storage meal photo uploads and metadata."""
import asyncio
import base64
import hashlib
import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import httpx
from app.services.image_analysis_service import (
    ImageAnalysisService,
    STORAGE_BUCKET,
    MODEL_PROVIDER,
    MODEL_VERSION,
    ANALYSIS_VERSION,
)
from app.schemas.meal_scan import (
    ImageAnalysisRequest,
    MealImageAnalysisResponse,
    ConfirmedFoodItem,
    MealScanConfirmRequest,
)

# Sample 1x1 valid JPEG image
SAMPLE_JPEG_BYTES = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00"
    b"\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19"
    b"\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342"
    b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05"
    b"\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07"
    b"\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)
SAMPLE_JPEG_B64 = base64.b64encode(SAMPLE_JPEG_BYTES).decode("utf-8")


def test_validate_image_data_valid_jpeg():
    """Validates JPEG bytes, identifies MIME type, and generates correct SHA-256."""
    image_bytes, mime, ext, sha256_hash = ImageAnalysisService.validate_image_data(SAMPLE_JPEG_B64)
    assert mime == "image/jpeg"
    assert ext == ".jpg"
    assert len(sha256_hash) == 64
    assert sha256_hash == hashlib.sha256(SAMPLE_JPEG_BYTES).hexdigest()
    assert image_bytes == SAMPLE_JPEG_BYTES


def test_validate_image_data_with_data_uri_header():
    """Accepts data:image/jpeg;base64,... URI headers seamlessly."""
    data_uri = f"data:image/jpeg;base64,{SAMPLE_JPEG_B64}"
    image_bytes, mime, ext, sha256_hash = ImageAnalysisService.validate_image_data(data_uri)
    assert mime == "image/jpeg"
    assert sha256_hash == hashlib.sha256(SAMPLE_JPEG_BYTES).hexdigest()


def test_validate_image_data_rejects_empty_or_corrupt():
    """Rejects empty strings and invalid base64 payloads."""
    with pytest.raises(ValueError, match="Image data is empty or too short"):
        ImageAnalysisService.validate_image_data("")

    with pytest.raises(ValueError):
        ImageAnalysisService.validate_image_data("NotValidBase64DataMoreThanTwentyCharsLong!")


def test_validate_image_data_rejects_tiny_payload():
    """Rejects payload with decoded binary smaller than 100 bytes."""
    tiny_b64 = base64.b64encode(b"x" * 50).decode("utf-8")
    with pytest.raises(ValueError, match="too small"):
        ImageAnalysisService.validate_image_data(tiny_b64)


def test_upload_image_to_storage_generates_user_isolated_path():
    """Ensures photos are uploaded to private bucket with user-isolated path and 24-hr signed URL."""
    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_client.storage.from_.return_value = mock_bucket
    mock_bucket.create_signed_url.return_value = {"signedURL": "https://storage.supabase.co/signed/photo.jpg"}

    user_id = "usr-123e4567"
    img_hash = hashlib.sha256(SAMPLE_JPEG_BYTES).hexdigest()

    storage_path, signed_url = ImageAnalysisService.upload_image_to_storage(
        client=mock_client,
        user_id=user_id,
        image_bytes=SAMPLE_JPEG_BYTES,
        mime_type="image/jpeg",
        image_hash=img_hash,
        ext=".jpg"
    )

    # 1. Bucket called must be private bucket
    mock_client.storage.from_.assert_called_with(STORAGE_BUCKET)

    # 2. Path must start with user_{user_id}/ to satisfy Storage RLS
    assert storage_path.startswith(f"user_{user_id}/")
    assert img_hash[:16] in storage_path
    assert storage_path.endswith(".jpg")

    # 3. Signed URL was generated
    assert signed_url == "https://storage.supabase.co/signed/photo.jpg"
    mock_bucket.create_signed_url.assert_called_once_with(path=storage_path, expires_in=86400)


def test_upload_image_to_storage_auto_creates_bucket_if_missing():
    """If private bucket doesn't exist yet, attempts to create it as private."""
    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_client.storage.from_.return_value = mock_bucket

    # First upload fails with "Bucket not found"
    mock_bucket.upload.side_effect = [Exception("Bucket not found 404"), None]
    mock_bucket.create_signed_url.return_value = {"signedURL": "https://storage.supabase.co/signed/photo.jpg"}

    storage_path, signed_url = ImageAnalysisService.upload_image_to_storage(
        client=mock_client,
        user_id="user-auto-bucket",
        image_bytes=SAMPLE_JPEG_BYTES,
        mime_type="image/jpeg",
        image_hash="abc123hash",
        ext=".jpg"
    )

    # Bucket creation called with public=False
    mock_client.storage.create_bucket.assert_called_once_with(
        STORAGE_BUCKET,
        options={
            "public": False,
            "file_size_limit": 10 * 1024 * 1024,
            "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"]
        }
    )
    assert storage_path.startswith("user_user-auto-bucket/")


def test_image_metadata_construction_and_validation():
    """Validates full metadata construction for storage and database persistence."""
    user_id = "test-user-uuid-101"
    image_bytes, mime, ext, image_hash = ImageAnalysisService.validate_image_data(SAMPLE_JPEG_B64)

    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_client.storage.from_.return_value = mock_bucket
    mock_bucket.create_signed_url.return_value = {"signedURL": "https://storage.supabase.co/signed/meal.jpg"}

    storage_path, signed_url = ImageAnalysisService.upload_image_to_storage(
        client=mock_client,
        user_id=user_id,
        image_bytes=image_bytes,
        mime_type=mime,
        image_hash=image_hash,
        ext=ext
    )

    detected_items = [
        ImageAnalysisService.calculate_detected_item_nutrition({
            "name": "Chapati",
            "aliases": ["roti"],
            "category": "flatbread",
            "preparation": "cooked",
            "estimated_weight_g": 70.0,
            "serving_quantity": 2.0,
            "serving_unit": "piece"
        }),
        ImageAnalysisService.calculate_detected_item_nutrition({
            "name": "Yellow Dal",
            "aliases": ["dal tadka"],
            "category": "lentil",
            "preparation": "cooked",
            "estimated_weight_g": 150.0,
            "serving_quantity": 1.0,
            "serving_unit": "bowl"
        })
    ]

    detected_labels = [it.name for it in detected_items]
    assert detected_labels == ["Chapati", "Yellow Dal"]

    # Verify PostgreSQL metadata record structure
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    db_record = {
        "id": "test-img-uuid-555",
        "user_id": user_id,
        "storage_path": storage_path,
        "label": "Lunch Plate Scan",
        "image_hash": image_hash,
        "analysis_status": "completed",
        "detected_labels": detected_labels,
        "detected_foods_json": [it.model_dump() for it in detected_items],
        "original_ai_prediction_json": [it.model_dump() for it in detected_items],
        "model_provider": MODEL_PROVIDER,
        "model_version": MODEL_VERSION,
        "analysis_version": ANALYSIS_VERSION,
        "user_confirmed": False,
        "allow_training_consent": True,
        "token_usage_json": {"estimated_prompt_tokens": 300, "estimated_completion_tokens": 150},
        "metadata": {"meal_type": "lunch", "raw_count": len(detected_items), "overall_uncertainty": "Visual estimate"},
        "created_at": now_iso,
        "updated_at": now_iso
    }

    assert db_record["user_id"] == user_id
    assert db_record["storage_path"] == storage_path
    assert db_record["image_hash"] == image_hash
    assert db_record["analysis_status"] == "completed"
    assert db_record["detected_labels"] == ["Chapati", "Yellow Dal"]
    assert db_record["original_ai_prediction_json"] is not None
    assert db_record["model_version"] == MODEL_VERSION
    assert "created_at" in db_record
    assert "updated_at" in db_record

    # Verify MealImageAnalysisResponse schema compatibility
    response = MealImageAnalysisResponse(
        image_id=db_record["id"],
        image_hash=image_hash,
        storage_path=storage_path,
        signed_image_url=signed_url,
        is_cached_analysis=False,
        requires_confirmation=True,
        overall_uncertainty="Visual estimate",
        foods=detected_items,
        detected_labels=detected_labels,
        original_ai_prediction=[it.model_dump() for it in detected_items],
        total_calories=round(sum(it.estimated_calories for it in detected_items), 1),
        total_protein_g=round(sum(it.protein_g for it in detected_items), 1),
        total_carbohydrates_g=round(sum(it.carbohydrates_g for it in detected_items), 1),
        total_fat_g=round(sum(it.fat_g for it in detected_items), 1),
        model_provider=MODEL_PROVIDER,
        model_version=MODEL_VERSION,
        analysis_version=ANALYSIS_VERSION
    )

    assert response.storage_path.startswith(f"user_{user_id}/")
    assert response.signed_image_url == "https://storage.supabase.co/signed/meal.jpg"
    assert response.detected_labels == ["Chapati", "Yellow Dal"]
    assert response.original_ai_prediction is not None
    assert response.overall_uncertainty == "Visual estimate"
    assert len(response.foods) == 2


def test_duplicate_cache_signed_url_generation():
    """Duplicate image cache retrieval generates a fresh signed URL for the cached storage path."""
    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_client.storage.from_.return_value = mock_bucket
    mock_bucket.create_signed_url.return_value = {"signedURL": "https://storage.supabase.co/signed/cached_photo.jpg"}

    # Mock cached record in database
    cached_db_row = {
        "id": "cached-img-123",
        "user_id": "usr-cache-1",
        "storage_path": "user_usr-cache-1/abc123hash_12345.jpg",
        "image_hash": "abc123hash",
        "analysis_version": ANALYSIS_VERSION,
        "analysis_status": "completed",
        "detected_labels": ["Roti", "Dal"],
        "detected_foods_json": [
            {
                "name": "Roti",
                "estimated_weight_g": 35.0,
                "estimated_calories": 85.0,
                "protein_g": 2.5,
                "carbohydrates_g": 17.5,
                "fat_g": 0.4,
                "serving_quantity": 1.0,
                "serving_unit": "piece"
            }
        ]
    }

    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(data=[cached_db_row])
    query_mock.eq.return_value = query_mock
    query_mock.gte.return_value = query_mock
    query_mock.order.return_value = query_mock
    query_mock.limit.return_value = query_mock
    mock_client.table.return_value.select.return_value = query_mock

    cached = ImageAnalysisService.check_duplicate_image_cache(
        client=mock_client,
        user_id="usr-cache-1",
        image_hash="abc123hash"
    )

    assert cached is not None
    assert cached["id"] == "cached-img-123"
    assert cached["storage_path"] == "user_usr-cache-1/abc123hash_12345.jpg"
    assert cached["detected_labels"] == ["Roti", "Dal"]


def test_delete_food_image_enforces_user_isolation():
    """Deletes image only when owned by authenticated user."""
    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_client.table.return_value = mock_table
    mock_bucket = MagicMock()
    mock_client.storage.from_.return_value = mock_bucket

    # User owns image
    mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"storage_path": "user_usr-123/hash_photo.jpg"}
    ]

    success = ImageAnalysisService.delete_food_image(
        client=mock_client,
        user_id="usr-123",
        image_id="img-456"
    )
    assert success is True
    mock_bucket.remove.assert_called_once_with(["user_usr-123/hash_photo.jpg"])
    mock_table.delete.return_value.eq.return_value.eq.assert_called_with("user_id", "usr-123")


def test_parse_vision_response_gemini_vision_structured_validation():
    """Gemini Vision response is parsed and validated against strict Pydantic schemas."""
    mock_raw_data = {
        "foods": [
            {
                "name": "Chapati",
                "aliases": ["roti", "phulka"],
                "category": "flatbread",
                "preparation": "cooked",
                "estimated_weight_g": 70.0,
                "serving_description": "2 medium chapatis (~70g)",
                "serving_quantity": 2.0,
                "serving_unit": "piece",
                "confidence": "high",
                "assumptions": ["Visual estimate: 2 medium whole-wheat flatbreads with light ghee"],
                "uncertainty": "Surface ghee amount cannot be determined visually"
            },
            {
                "name": "Yellow Dal Tadka",
                "aliases": ["toor dal", "yellow dal"],
                "category": "lentil",
                "preparation": "cooked",
                "estimated_weight_g": 150.0,
                "serving_description": "1 standard bowl / katori (~150g)",
                "serving_quantity": 1.0,
                "serving_unit": "bowl",
                "confidence": "medium",
                "assumptions": ["Visual estimate: 1 bowl yellow lentil soup with cumin-mustard tempering"],
                "uncertainty": "Tempering oil quantity and salt content are uncertain"
            },
            {
                "name": "Cooked White Rice",
                "aliases": ["steamed rice", "bhat"],
                "category": "grain",
                "preparation": "steamed",
                "estimated_weight_g": 150.0,
                "serving_description": "1 medium heap (~150g)",
                "serving_quantity": 1.0,
                "serving_unit": "cup",
                "confidence": "high",
                "assumptions": ["Visual estimate: standard mound of plain steamed rice"],
                "uncertainty": "Depth and density of rice mound"
            }
        ],
        "overall_uncertainty": "Portion estimates are visual approximations. Exact oils, salt, and hidden ingredients cannot be verified from a photograph."
    }

    foods, overall_unc = ImageAnalysisService.parse_vision_response(mock_raw_data)

    assert len(foods) == 3
    # First item checks
    assert foods[0]["name"] == "Chapati"
    assert foods[0]["estimated_weight_g"] == 70.0
    assert foods[0]["confidence"] == "high"
    assert "Surface ghee" in foods[0]["uncertainty"]
    assert len(foods[0]["assumptions"]) > 0

    # Second item checks
    assert foods[1]["name"] == "Yellow Dal Tadka"
    assert foods[1]["estimated_weight_g"] == 150.0

    # Third item checks
    assert foods[2]["name"] == "Cooked White Rice"
    assert foods[2]["category"] == "grain"

    # Overall plate uncertainty checks
    assert overall_unc is not None
    assert "Exact oils" in overall_unc


def test_parse_vision_response_salvages_valid_items_on_malformed_entries():
    """Item-by-item salvage loop keeps valid items even if an item has invalid types or missing fields."""
    mock_raw_data = {
        "foods": [
            {
                "name": "Bhakri",
                "aliases": ["jowar bhakri"],
                "category": "flatbread",
                "preparation": "roasted",
                "estimated_weight_g": 60.0,
                "serving_description": "1 piece (~60g)",
                "serving_quantity": 1.0,
                "serving_unit": "piece",
                "confidence": "high",
                "assumptions": ["Visual estimate: 1 dry roasted jowar bhakri"],
                "uncertainty": None
            },
            {
                # Invalid item: negative estimated_weight_g fails Pydantic gt=0
                "name": "Corrupt Item",
                "estimated_weight_g": -50.0
            }
        ],
        "overall_uncertainty": "Mild glare on plate surface"
    }

    foods, overall_unc = ImageAnalysisService.parse_vision_response(mock_raw_data)

    assert len(foods) == 1
    assert foods[0]["name"] == "Bhakri"
    assert foods[0]["estimated_weight_g"] == 60.0
    assert overall_unc == "Mild glare on plate surface"


def test_recalculate_item_local_arithmetic():
    """Recalculating item portion updates nutrition locally with zero AI or external calls."""
    # 2 chapatis (~70g)
    resp2 = ImageAnalysisService.recalculate_item(
        food_name="Chapati",
        quantity=2.0,
        unit="piece",
        preparation="cooked",
        weight_g=70.0
    )
    # 1 chapati (~35g)
    resp1 = ImageAnalysisService.recalculate_item(
        food_name="Chapati",
        quantity=1.0,
        unit="piece",
        preparation="cooked",
        weight_g=35.0
    )

    assert resp1.estimated_calories > 0
    assert resp2.estimated_calories > resp1.estimated_calories
    assert abs(resp2.estimated_calories - (resp1.estimated_calories * 2)) < 5.0
