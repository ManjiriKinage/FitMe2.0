"""Acceptance tests for Phase 6, Phase 7, and Phase 8:
- Food logging and local-day timezone reconciliation
- User-specific portion and preference learning with multi-tenant isolation
- Profile onboarding, Mifflin-St Jeor energy calculations, and goal recalculation
"""
import pytest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from app.services.user_learning import UserPreferenceLearningEngine, CONFIRMATION_THRESHOLD
from app.services.calorie_calculator import (
    calculate_bmr,
    calculate_bmi,
    calculate_calories,
    ACTIVITY_MULTIPLIERS
)
from app.schemas.user import CalorieCalculationInput
from app.services.nutrition_service import aggregate_daily_dashboard

# Mock Supabase table interface for testing multi-tenant isolation and preferences
class MockTable:
    def __init__(self, data_store, table_name):
        self.data_store = data_store
        self.table_name = table_name
        self._filters = []
        self._action = "select"
        self._insert_data = None
        self._update_data = None

    def select(self, *args, **kwargs):
        self._action = "select"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def gte(self, col, val):
        return self

    def lte(self, col, val):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, count):
        return self

    def range(self, *args):
        return self

    def insert(self, record):
        self._action = "insert"
        self._insert_data = record
        return self

    def update(self, updates):
        self._action = "update"
        self._update_data = updates
        return self

    def delete(self):
        self._action = "delete"
        return self

    def execute(self):
        class MockResult:
            def __init__(self, d):
                self.data = d

        if self.table_name not in self.data_store:
            self.data_store[self.table_name] = []

        records = self.data_store[self.table_name]

        if self._action == "insert":
            rec = dict(self._insert_data)
            if "id" not in rec:
                rec["id"] = f"{self.table_name}_{len(records) + 1}"
            records.append(rec)
            return MockResult([rec])

        elif self._action == "update":
            updated = []
            for r in records:
                match = all(r.get(c) == v for c, v in self._filters)
                if match:
                    r.update(self._update_data)
                    updated.append(dict(r))
            return MockResult(updated)

        elif self._action == "delete":
            remaining = [r for r in records if not all(r.get(c) == v for c, v in self._filters)]
            self.data_store[self.table_name] = remaining
            return MockResult([])

        else: # select
            filtered = [dict(r) for r in records if all(r.get(c) == v for c, v in self._filters)]
            return MockResult(filtered)


class MockSupabaseClient:
    def __init__(self):
        self.store = {
            "user_food_preferences": [],
            "user_food_feedback": [],
            "food_logs": []
        }

    def table(self, name):
        return MockTable(self.store, name)


# ==============================================================================
# PHASE 7 ACCEPTANCE TESTS: USER-SPECIFIC PREFERENCE LEARNING
# ==============================================================================

def test_two_users_different_preferences_same_food():
    """Verify that User A and User B maintain isolated, distinct preferences for the same food."""
    client = MockSupabaseClient()

    # User A consistently eats 3 chapatis
    UserPreferenceLearningEngine.record_confirmed_log(
        client=client,
        user_id="user_alpha",
        food_name="chapati",
        quantity=3.0,
        serving_unit="piece"
    )
    UserPreferenceLearningEngine.record_confirmed_log(
        client=client,
        user_id="user_alpha",
        food_name="chapati",
        quantity=3.0,
        serving_unit="piece"
    )

    # User B consistently eats 1.5 chapatis
    UserPreferenceLearningEngine.record_confirmed_log(
        client=client,
        user_id="user_beta",
        food_name="chapati",
        quantity=1.5,
        serving_unit="piece"
    )
    UserPreferenceLearningEngine.record_confirmed_log(
        client=client,
        user_id="user_beta",
        food_name="chapati",
        quantity=1.5,
        serving_unit="piece"
    )

    pref_a = UserPreferenceLearningEngine.get_user_preference(client, "user_alpha", "chapati")
    pref_b = UserPreferenceLearningEngine.get_user_preference(client, "user_beta", "chapati")

    assert pref_a is not None
    assert pref_b is not None
    assert pref_a["preferred_serving_quantity"] == 3.0
    assert pref_b["preferred_serving_quantity"] == 1.5
    assert pref_a["user_id"] == "user_alpha"
    assert pref_b["user_id"] == "user_beta"


def test_one_users_correction_cannot_alter_another_user():
    """Verify that user A updating their preference does not affect user B."""
    client = MockSupabaseClient()

    # Seed both users
    UserPreferenceLearningEngine.record_confirmed_log(client, "user_1", "dal", 1.0, "bowl")
    UserPreferenceLearningEngine.record_confirmed_log(client, "user_1", "dal", 1.0, "bowl")

    UserPreferenceLearningEngine.record_confirmed_log(client, "user_2", "dal", 2.0, "bowl")
    UserPreferenceLearningEngine.record_confirmed_log(client, "user_2", "dal", 2.0, "bowl")

    # User 1 submits a correction/update
    pref1 = UserPreferenceLearningEngine.get_user_preference(client, "user_1", "dal")
    assert pref1 is not None
    UserPreferenceLearningEngine.update_user_preference(
        client=client,
        user_id="user_1",
        pref_id=pref1["id"],
        quantity=0.5,
        serving_unit="katori"
    )

    # Re-verify both
    updated_1 = UserPreferenceLearningEngine.get_user_preference(client, "user_1", "dal")
    unchanged_2 = UserPreferenceLearningEngine.get_user_preference(client, "user_2", "dal")

    assert updated_1["preferred_serving_quantity"] == 0.5
    assert unchanged_2["preferred_serving_quantity"] == 2.0


def test_insufficient_evidence_triggers_standard_default():
    """Single unconfirmed observation (< CONFIRMATION_THRESHOLD) must not become a strong preference."""
    client = MockSupabaseClient()

    # Only 1 observation logged
    UserPreferenceLearningEngine.record_confirmed_log(
        client=client,
        user_id="user_3",
        food_name="upma",
        quantity=2.0,
        serving_unit="plate"
    )

    pref = UserPreferenceLearningEngine.get_user_preference(client, "user_3", "upma")
    # Must return None because threshold is 2
    assert pref is None


def test_new_preferences_do_not_rewrite_historical_food_logs():
    """Preferences must never rewrite previous food log snapshots."""
    client = MockSupabaseClient()

    # Historical food log
    historical_log = {
        "id": "log_001",
        "user_id": "user_4",
        "food_name": "Roti",
        "quantity": 2.0,
        "unit": "piece",
        "estimated_calories": 170.0,
        "protein_g": 6.0,
        "carbohydrates_g": 34.0,
        "fat_g": 1.0,
        "meal_type": "dinner",
        "logged_at": "2026-10-20T19:00:00Z"
    }
    client.store["food_logs"].append(historical_log)

    # Later, user establishes a new preference of 4 rotis
    UserPreferenceLearningEngine.record_confirmed_log(client, "user_4", "Roti", 4.0, "piece")
    UserPreferenceLearningEngine.record_confirmed_log(client, "user_4", "Roti", 4.0, "piece")

    pref = UserPreferenceLearningEngine.get_user_preference(client, "user_4", "Roti")
    assert pref["preferred_serving_quantity"] == 4.0

    # Historical log must remain untouched
    saved_log = client.store["food_logs"][0]
    assert saved_log["quantity"] == 2.0
    assert saved_log["estimated_calories"] == 170.0


# ==============================================================================
# PHASE 6 ACCEPTANCE TESTS: TIMEZONE HANDLING & RECONCILIATION
# ==============================================================================

def test_local_day_timezone_boundary_handling():
    """Verify that local calendar day start and end in IST (UTC+5:30) partition correctly."""
    ist_tz = ZoneInfo("Asia/Kolkata")
    local_date_str = "2026-10-25"

    local_start = datetime.strptime(f"{local_date_str} 00:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=ist_tz)
    local_end = datetime.strptime(f"{local_date_str} 23:59:59", "%Y-%m-%d %H:%M:%S").replace(tzinfo=ist_tz)

    utc_start = local_start.astimezone(timezone.utc)
    utc_end = local_end.astimezone(timezone.utc)

    # 00:00 IST on 2026-10-25 is 18:30 UTC on 2026-10-24
    assert utc_start.day == 24
    assert utc_start.hour == 18
    assert utc_start.minute == 30

    # 23:59:59 IST on 2026-10-25 is 18:29:59 UTC on 2026-10-25
    assert utc_end.day == 25
    assert utc_end.hour == 18
    assert utc_end.minute == 29


def test_dashboard_aggregation_meal_reconciliation():
    """Meal subtotals must sum exactly to daily consumed total."""
    logs = [
        {"id": "1", "meal_type": "breakfast", "estimated_calories": 300.0, "protein_g": 10.0, "carbohydrates_g": 50.0, "fat_g": 5.0, "logged_at": "2026-10-25T08:00:00Z"},
        {"id": "2", "meal_type": "lunch", "estimated_calories": 650.0, "protein_g": 25.0, "carbohydrates_g": 90.0, "fat_g": 20.0, "logged_at": "2026-10-25T13:00:00Z"},
        {"id": "3", "meal_type": "snack", "estimated_calories": 150.0, "protein_g": 3.0, "carbohydrates_g": 20.0, "fat_g": 6.0, "logged_at": "2026-10-25T16:30:00Z"},
        {"id": "4", "meal_type": "dinner", "estimated_calories": 500.0, "protein_g": 22.0, "carbohydrates_g": 60.0, "fat_g": 15.0, "logged_at": "2026-10-25T20:00:00Z"},
    ]

    summary = aggregate_daily_dashboard(
        daily_calorie_target=1800,
        food_logs=logs,
        target_date="2026-10-25"
    )

    subtotals_sum = sum(
        sum(item.estimated_calories for item in meal_items)
        for meal_items in summary.meals.values()
    )

    assert summary.calories_consumed == 1600.0
    assert subtotals_sum == summary.calories_consumed
    assert summary.calories_remaining == 200.0
    assert summary.macro_totals.protein_g == 60.0


# ==============================================================================
# PHASE 8 ACCEPTANCE TESTS: PROFILE & CALORIE CALCULATIONS
# ==============================================================================

def test_mifflin_st_jeor_bmr_calculation():
    """Verify standard Mifflin-St Jeor equation for male and female profiles."""
    # Male: 10 * 75 + 6.25 * 175 - 5 * 28 + 5 = 750 + 1093.75 - 140 + 5 = 1708.75 -> 1709
    male_bmr = calculate_bmr(weight_kg=75.0, height_cm=175.0, age=28, gender="male")
    assert round(male_bmr) == 1709

    # Female: 10 * 60 + 6.25 * 162 - 5 * 25 - 161 = 600 + 1012.5 - 125 - 161 = 1326.5
    female_bmr = calculate_bmr(weight_kg=60.0, height_cm=162.0, age=25, gender="female")
    assert female_bmr == 1326.5


def test_tdee_and_calorie_targets():
    """Verify conservative deficit for weight loss and surplus for weight gain."""
    input_loss = CalorieCalculationInput(
        age=25,
        gender="male",
        height_cm=175.0,
        current_weight_kg=75.0,
        activity_level="moderately_active",
        fitness_goal="lose_weight"
    )
    res_loss = calculate_calories(input_loss)
    # TDEE = BMR * 1.55
    assert res_loss.tdee > res_loss.bmr
    assert res_loss.daily_calorie_target < res_loss.tdee
    assert res_loss.daily_calorie_target >= 1500  # Above safe male minimum

    input_gain = CalorieCalculationInput(
        age=25,
        gender="male",
        height_cm=175.0,
        current_weight_kg=75.0,
        activity_level="moderately_active",
        fitness_goal="gain_muscle"
    )
    res_gain = calculate_calories(input_gain)
    assert res_gain.daily_calorie_target > res_gain.tdee


def test_minor_and_clinical_warnings():
    """Minors (<18) must receive medical advisory warning without clinical restriction."""
    input_minor = CalorieCalculationInput(
        age=16,
        gender="female",
        height_cm=160.0,
        current_weight_kg=55.0,
        activity_level="moderately_active",
        fitness_goal="lose_weight"
    )
    result = calculate_calories(input_minor)
    assert any("under 18" in w.lower() or "pediatrician" in w.lower() for w in result.warnings)

