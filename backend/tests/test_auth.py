"""Unit tests for public auth/calculation endpoints."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"

def test_public_calculate_endpoint():
    payload = {
        "age": 28,
        "gender": "male",
        "height_cm": 175,
        "current_weight_kg": 75,
        "activity_level": "moderately_active",
        "fitness_goal": "lose_weight",
        "target_weight_kg": 70
    }
    res = client.post("/api/auth/calculate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["daily_calorie_target"] > 0
    assert data["bmr"] > 0
    assert data["tdee"] > data["bmr"]
    assert "macro_targets" in data
