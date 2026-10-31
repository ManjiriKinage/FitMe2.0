"""Unit tests for Confirm & Save endpoint: saving food logs, image references,
corrected quantities, daily dashboard updates, idempotency, and user authorization.
"""
import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.api.meals import confirm_scanned_meal
from app.api.food import confirm_and_save_meal
from app.schemas.meal_scan import (
    ConfirmedFoodItem,
    MealScanConfirmRequest,
    MealScanConfirmResponse,
)
from app.schemas.food import (
    FoodLogCreate,
    BatchFoodLogRequest,
    BatchFoodLogResponse,
)


def create_mock_db_client():
    """Builds a mock Supabase client for testing."""
    client = MagicMock()
    table_mock = MagicMock()
    client.table.return_value = table_mock

    # Default execute response
    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(data=[])
    table_mock.select.return_value = query_mock
    query_mock.eq.return_value = query_mock
    query_mock.gte.return_value = query_mock
    query_mock.lte.return_value = query_mock
    query_mock.order.return_value = query_mock
    query_mock.limit.return_value = query_mock

    # Insert response mock
    insert_mock = MagicMock()
    insert_mock.execute.return_value = MagicMock(data=[])
    table_mock.insert.return_value = insert_mock

    # Update response mock
    update_mock = MagicMock()
    update_mock.execute.return_value = MagicMock(data=[])
    table_mock.update.return_value = query_mock

    return client, table_mock


@pytest.mark.asyncio
async def test_confirm_scan_saves_all_confirmed_items_and_image_reference():
    """
    Saves confirmed food items, corrected quantities, nutrition totals,
    image reference (food_image_id), user_id, and meal timestamp into food_logs.
    """
    user_id = str(uuid.uuid4())
    image_id = str(uuid.uuid4())
    meal_time = "2026-10-31T12:30:00Z"

    client, table_mock = create_mock_db_client()

    # food_images ownership check: image belongs to this user
    def table_router(table_name):
        mock_t = MagicMock()
        if table_name == "food_images":
            sel_q = MagicMock()
            sel_q.eq.return_value.execute.return_value = MagicMock(data=[{
                "id": image_id,
                "user_id": user_id,
                "user_confirmed": False
            }])
            mock_t.select.return_value = sel_q
            mock_t.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        elif table_name == "food_logs":
            # select for idempotency check returns empty initially
            sel_q = MagicMock()
            sel_q.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            sel_q.eq.return_value.gte.return_value.execute.return_value = MagicMock(data=[])
            sel_q.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value = MagicMock(data=[])
            mock_t.select.return_value = sel_q

            # insert returns the newly inserted row
            def insert_impl(row_data):
                ret_row = dict(row_data)
                ret_row["id"] = str(uuid.uuid4())
                ins_q = MagicMock()
                ins_q.execute.return_value = MagicMock(data=[ret_row])
                return ins_q
            mock_t.insert.side_effect = insert_impl
        elif table_name == "profiles":
            sel_q = MagicMock()
            sel_q.eq.return_value.execute.return_value = MagicMock(data=[{
                "id": user_id,
                "daily_calorie_target": 2000,
                "timezone": "Asia/Kolkata"
            }])
            mock_t.select.return_value = sel_q
        elif table_name == "plate_scan_feedback":
            ins_q = MagicMock()
            ins_q.execute.return_value = MagicMock(data=[{"id": str(uuid.uuid4())}])
            mock_t.insert.return_value = ins_q
        return mock_t

    client.table.side_effect = table_router

    payload = MealScanConfirmRequest(
        image_id=image_id,
        meal_type="lunch",
        logged_at=datetime.fromisoformat(meal_time.replace("Z", "+00:00")),
        items=[
            ConfirmedFoodItem(
                food_name="Bajra Bhakri",
                quantity=2.0,
                unit="piece",
                estimated_calories=280.0,
                protein_g=7.6,
                carbohydrates_g=57.0,
                fat_g=2.4,
                preparation="roasted",
                estimated_weight_g=100.0,
                was_edited=True
            ),
            ConfirmedFoodItem(
                food_name="Moong Dal",
                quantity=1.0,
                unit="bowl",
                estimated_calories=140.0,
                protein_g=8.0,
                carbohydrates_g=22.0,
                fat_g=2.0,
                preparation="cooked",
                estimated_weight_g=150.0
            )
        ],
        allow_training_consent=True
    )

    with patch("app.api.meals.get_supabase_admin_client", return_value=client):
        res = await confirm_scanned_meal(payload=payload, user={"id": user_id, "email": "test@fitme.com"})

    assert res.success is True
    assert res.saved_count == 2
    assert res.total_calories == 420.0
    assert len(res.saved_logs) == 2

    # Check first item details
    log1 = res.saved_logs[0]
    assert log1.food_name == "Bajra Bhakri"
    assert log1.quantity == 2.0
    assert log1.unit == "piece"
    assert log1.estimated_calories == 280.0
    assert log1.food_image_id == image_id
    assert log1.user_id == user_id
    assert log1.meal_type == "lunch"

    # Check second item details
    log2 = res.saved_logs[1]
    assert log2.food_name == "Moong Dal"
    assert log2.quantity == 1.0
    assert log2.estimated_calories == 140.0
    assert log2.food_image_id == image_id
    assert log2.user_id == user_id


@pytest.mark.asyncio
async def test_confirm_scan_updates_daily_dashboard_totals():
    """
    Confirms meal scan and verifies that updated daily dashboard summary
    is computed and returned with current consumed calories, remaining calories, and macros.
    """
    user_id = str(uuid.uuid4())
    image_id = str(uuid.uuid4())

    client, _ = create_mock_db_client()

    def table_router(table_name):
        mock_t = MagicMock()
        if table_name == "food_images":
            sel_q = MagicMock()
            sel_q.eq.return_value.execute.return_value = MagicMock(data=[{
                "id": image_id,
                "user_id": user_id,
                "user_confirmed": False
            }])
            mock_t.select.return_value = sel_q
            mock_t.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        elif table_name == "food_logs":
            sel_q = MagicMock()
            sel_q.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            sel_q.eq.return_value.gte.return_value.execute.return_value = MagicMock(data=[])
            # For dashboard calculation query
            sel_q.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value = MagicMock(data=[{
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "food_name": "Paneer Tikka",
                "quantity": 1.0,
                "unit": "plate",
                "estimated_calories": 350.0,
                "protein_g": 22.0,
                "carbohydrates_g": 10.0,
                "fat_g": 24.0,
                "meal_type": "lunch",
                "logged_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "food_image_id": image_id
            }])
            mock_t.select.return_value = sel_q
            def insert_impl(row_data):
                ret = dict(row_data)
                ret["id"] = str(uuid.uuid4())
                ins_q = MagicMock()
                ins_q.execute.return_value = MagicMock(data=[ret])
                return ins_q
            mock_t.insert.side_effect = insert_impl
        elif table_name == "profiles":
            sel_q = MagicMock()
            sel_q.eq.return_value.execute.return_value = MagicMock(data=[{
                "id": user_id,
                "daily_calorie_target": 1800,
                "fitness_goal": "fat_loss",
                "current_weight_kg": 68.0,
                "timezone": "UTC"
            }])
            mock_t.select.return_value = sel_q
        elif table_name == "plate_scan_feedback":
            mock_t.insert.return_value.execute.return_value = MagicMock(data=[])
        return mock_t

    client.table.side_effect = table_router

    payload = MealScanConfirmRequest(
        image_id=image_id,
        meal_type="lunch",
        items=[
            ConfirmedFoodItem(
                food_name="Paneer Tikka",
                quantity=1.0,
                unit="plate",
                estimated_calories=350.0,
                protein_g=22.0,
                carbohydrates_g=10.0,
                fat_g=24.0
            )
        ]
    )

    with patch("app.api.meals.get_supabase_admin_client", return_value=client):
        res = await confirm_scanned_meal(payload=payload, user={"id": user_id})

    assert res.success is True
    assert res.daily_summary is not None
    assert res.daily_summary.daily_calorie_target == 1800
    assert res.daily_summary.calories_consumed == 350.0
    assert res.daily_summary.calories_remaining == 1450.0
    assert res.daily_summary.macro_totals.protein_g == 22.0
    assert res.daily_summary.macro_totals.fat_g == 24.0


@pytest.mark.asyncio
async def test_confirm_scan_idempotency_prevents_duplicate_logs_on_retry():
    """
    Retrying or double-clicking Confirm Meal Scan does not re-insert duplicate records.
    Restores and returns existing saved food log records.
    """
    user_id = str(uuid.uuid4())
    image_id = str(uuid.uuid4())
    existing_log_id = str(uuid.uuid4())

    client, _ = create_mock_db_client()

    # Mock DB where food_logs ALREADY has an entry for this user and image_id
    already_saved_row = {
        "id": existing_log_id,
        "user_id": user_id,
        "food_image_id": image_id,
        "food_name": "Vegetable Poha",
        "quantity": 1.0,
        "unit": "plate",
        "estimated_calories": 250.0,
        "protein_g": 5.0,
        "carbohydrates_g": 42.0,
        "fat_g": 6.5,
        "meal_type": "breakfast",
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    insert_called = False

    def table_router(table_name):
        nonlocal insert_called
        mock_t = MagicMock()
        if table_name == "food_images":
            sel_q = MagicMock()
            sel_q.eq.return_value.execute.return_value = MagicMock(data=[{
                "id": image_id,
                "user_id": user_id,
                "user_confirmed": True
            }])
            mock_t.select.return_value = sel_q
        elif table_name == "food_logs":
            sel_q = MagicMock()
            # Idempotency query finds the existing record!
            sel_q.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[already_saved_row])
            mock_t.select.return_value = sel_q
            def track_insert(*args, **kwargs):
                nonlocal insert_called
                insert_called = True
                return MagicMock()
            mock_t.insert.side_effect = track_insert
        elif table_name == "profiles":
            mock_t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return mock_t

    client.table.side_effect = table_router

    payload = MealScanConfirmRequest(
        image_id=image_id,
        meal_type="breakfast",
        items=[
            ConfirmedFoodItem(
                food_name="Vegetable Poha",
                quantity=1.0,
                unit="plate",
                estimated_calories=250.0,
                protein_g=5.0,
                carbohydrates_g=42.0,
                fat_g=6.5
            )
        ]
    )

    with patch("app.api.meals.get_supabase_admin_client", return_value=client):
        res = await confirm_scanned_meal(payload=payload, user={"id": user_id})

    # Verifies idempotency
    assert insert_called is False, "Insert must NOT be called on retry when scan already confirmed."
    assert res.success is True
    assert res.saved_count == 1
    assert res.total_calories == 250.0
    assert res.saved_logs[0].id == existing_log_id
    assert "already logged" in res.message


@pytest.mark.asyncio
async def test_confirm_scan_enforces_user_isolation_forbidden_for_other_users_image():
    """
    Security check: Users cannot confirm meal photos uploaded by another user.
    Raises HTTP 403 Forbidden.
    """
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    image_id_user_a = str(uuid.uuid4())

    client, _ = create_mock_db_client()

    def table_router(table_name):
        mock_t = MagicMock()
        if table_name == "food_images":
            sel_q = MagicMock()
            # Image in DB belongs to user_a
            sel_q.eq.return_value.execute.return_value = MagicMock(data=[{
                "id": image_id_user_a,
                "user_id": user_a,  # Owner is User A!
                "user_confirmed": False
            }])
            mock_t.select.return_value = sel_q
        return mock_t

    client.table.side_effect = table_router

    payload = MealScanConfirmRequest(
        image_id=image_id_user_a,
        meal_type="lunch",
        items=[
            ConfirmedFoodItem(
                food_name="Steamed Idli",
                quantity=3.0,
                unit="piece",
                estimated_calories=150.0
            )
        ]
    )

    # User B tries to confirm User A's image!
    with patch("app.api.meals.get_supabase_admin_client", return_value=client):
        with pytest.raises(HTTPException) as exc_info:
            await confirm_scanned_meal(payload=payload, user={"id": user_b, "email": "user_b@fitme.com"})

    assert exc_info.value.status_code == 403
    assert "Forbidden" in exc_info.value.detail


@pytest.mark.asyncio
async def test_confirm_batch_food_log_saves_nutrition_and_updates_dashboard():
    """
    Multi-item confirmation via /api/food/confirm saves verified snapshot,
    links metadata, and returns updated daily_summary.
    """
    user_id = str(uuid.uuid4())
    client, _ = create_mock_db_client()

    def table_router(table_name):
        mock_t = MagicMock()
        if table_name == "food_logs":
            sel_q = MagicMock()
            sel_q.eq.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(data=[])
            # For dashboard
            sel_q.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value = MagicMock(data=[{
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "food_name": "Egg Omelette",
                "quantity": 1.0,
                "unit": "serving",
                "estimated_calories": 180.0,
                "protein_g": 13.0,
                "carbohydrates_g": 1.5,
                "fat_g": 14.0,
                "meal_type": "breakfast",
                "logged_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }])
            mock_t.select.return_value = sel_q
            def insert_impl(row_data):
                ret = dict(row_data)
                ret["id"] = str(uuid.uuid4())
                ins_q = MagicMock()
                ins_q.execute.return_value = MagicMock(data=[ret])
                return ins_q
            mock_t.insert.side_effect = insert_impl
        elif table_name == "profiles":
            sel_q = MagicMock()
            sel_q.eq.return_value.execute.return_value = MagicMock(data=[{
                "id": user_id,
                "daily_calorie_target": 2000,
                "timezone": "UTC"
            }])
            mock_t.select.return_value = sel_q
        return mock_t

    client.table.side_effect = table_router

    payload = BatchFoodLogRequest(
        meal_type="breakfast",
        items=[
            FoodLogCreate(
                food_name="Egg Omelette",
                quantity=1.0,
                unit="serving",
                estimated_calories=180.0,
                protein_g=13.0,
                carbohydrates_g=1.5,
                fat_g=14.0,
                meal_type="breakfast"
            )
        ]
    )

    with patch("app.api.food.get_supabase_admin_client", return_value=client):
        res = await confirm_and_save_meal(payload=payload, user={"id": user_id})

    assert res.success is True
    assert res.saved_count == 1
    assert res.total_calories == 180.0
    assert res.daily_summary is not None
    assert res.daily_summary.calories_consumed == 180.0
    assert res.daily_summary.calories_remaining == 1820.0

