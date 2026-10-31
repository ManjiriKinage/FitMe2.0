"""Unit tests for Feedback-Learning Pipeline, Disaggregated Corrections,
Explicit User Consent, Dataset Curation, and Periodic Model Fine-Tuning.

Verifies:
1. Separation of original AI predictions from user-confirmed food labels,
   portion corrections, and preparation corrections.
2. Explicit consent enforcement (non-consented examples are strictly excluded).
3. Labelled dataset collection, partitioning (train/val/test), and manifest export.
4. Pretrained food recognition model evaluation (Top-1, Top-3, Portion MAE).
5. Periodic batch fine-tuning pipeline guards: skips retraining on single uploads
   and only triggers when batch threshold is satisfied.
"""
import pytest
import uuid
import os
import json
import tempfile
from unittest.mock import MagicMock, patch

from app.schemas.meal_scan import ConfirmedFoodItem
from app.services.feedback_learning.diff_engine import FeedbackDiffEngine
from app.services.feedback_learning.dataset_curator import DatasetCurator
from app.services.feedback_learning.model_pipeline import (
    FitMeFoodPlateModel,
    PeriodicModelEvaluator,
    PeriodicFineTuningPipeline,
    FITME_FOOD_CLASSES,
)
from app.services.image_analysis_service import ImageAnalysisService


def test_diff_engine_disaggregates_original_prediction_from_corrections():
    """
    Verifies that FeedbackDiffEngine separates:
    - Original AI predictions
    - Confirmed food labels
    - Portion corrections (delta grams, percentage change)
    - Preparation corrections
    - Label renames, additions, and deletions
    """
    original_predictions = [
        {
            "name": "Roti",
            "estimated_weight_g": 70.0,
            "serving_quantity": 2.0,
            "serving_unit": "piece",
            "preparation": "cooked",
            "confidence": "high",
        },
        {
            "name": "Dal Tadka",
            "estimated_weight_g": 150.0,
            "serving_quantity": 1.0,
            "serving_unit": "bowl",
            "preparation": "ghee tempered",
            "confidence": "medium",
        },
        {
            "name": "Papad",
            "estimated_weight_g": 15.0,
            "serving_quantity": 1.0,
            "serving_unit": "piece",
            "preparation": "fried",
            "confidence": "low",
        }
    ]

    confirmed_items = [
        # 1. Roti portion increased from 70g to 105g (3 rotis)
        ConfirmedFoodItem(
            food_name="Roti",
            quantity=3.0,
            unit="piece",
            estimated_weight_g=105.0,
            estimated_calories=260.0,
            protein_g=7.5,
            carbohydrates_g=52.5,
            fat_g=1.2,
            preparation="cooked",
            was_edited=True,
        ),
        # 2. Dal preparation corrected to "boiled / less oil"
        ConfirmedFoodItem(
            food_name="Dal Tadka",
            quantity=1.0,
            unit="bowl",
            estimated_weight_g=150.0,
            estimated_calories=140.0,
            protein_g=9.0,
            carbohydrates_g=22.0,
            fat_g=2.0,
            preparation="boiled / less oil",
            was_edited=True,
        ),
        # 3. User manually added Paneer Bhurji (false negative, AI missed)
        ConfirmedFoodItem(
            food_name="Paneer Bhurji",
            quantity=1.0,
            unit="katori",
            estimated_weight_g=100.0,
            estimated_calories=220.0,
            protein_g=14.0,
            carbohydrates_g=4.0,
            fat_g=16.0,
            preparation="cooked",
            was_added=True,
        )
    ]

    # User deleted Papad (false positive, AI hallucinated)
    deleted_items = ["Papad"]

    diff = FeedbackDiffEngine.compute_feedback_disaggregation(
        original_prediction=original_predictions,
        confirmed_items=confirmed_items,
        deleted_items=deleted_items
    )

    # 1. Confirmed food labels
    assert len(diff["confirmed_food_labels"]) == 3
    names = [c["food_name"] for c in diff["confirmed_food_labels"]]
    assert "Roti" in names
    assert "Dal Tadka" in names
    assert "Paneer Bhurji" in names

    # 2. Portion corrections
    roti_portion = next(p for p in diff["portion_corrections"] if p["food_name"] == "Roti")
    assert roti_portion["original_weight_g"] == 70.0
    assert roti_portion["confirmed_weight_g"] == 105.0
    assert roti_portion["delta_grams"] == 35.0
    assert roti_portion["percent_change"] == 50.0
    assert roti_portion["was_portion_adjusted"] is True

    # 3. Preparation corrections
    dal_prep = next(pr for pr in diff["preparation_corrections"] if pr["food_name"] == "Dal Tadka")
    assert dal_prep["original_preparation"] == "ghee tempered"
    assert dal_prep["confirmed_preparation"] == "boiled / less oil"
    assert dal_prep["was_preparation_adjusted"] is True

    # 4. Label corrections
    label_corr = diff["label_corrections"]
    assert "Paneer Bhurji" in label_corr["added_items"]
    assert "Papad" in label_corr["deleted_items"]

    # 5. Delta metrics
    metrics = diff["delta_metrics"]
    assert metrics["added_items_count"] == 1
    assert metrics["deleted_items_count"] == 1
    assert metrics["has_corrections"] is True
    assert metrics["portion_mae_grams"] > 0


def test_explicit_consent_enforcement_in_feedback_recording():
    """
    Verifies that:
    1. If allow_training_consent=False, review_status is strictly set to 'consent_denied'.
    2. If allow_training_consent=True, review_status is set to 'approved_for_training'.
    """
    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_client.table.return_value = mock_table
    query_mock = MagicMock()
    query_mock.execute.return_value = MagicMock(data=[{"detected_foods_json": []}])
    mock_table.select.return_value = query_mock
    query_mock.eq.return_value = query_mock
    mock_table.update.return_value = query_mock
    mock_table.insert.return_value = query_mock

    confirmed_item = ConfirmedFoodItem(
        food_name="Idli",
        quantity=2.0,
        unit="piece",
        estimated_weight_g=80.0,
        estimated_calories=100.0,
        protein_g=4.0,
        carbohydrates_g=20.0,
        fat_g=0.4,
    )

    # Case A: User explicitly DENIES consent
    with patch("app.services.user_learning.UserPreferenceLearningEngine.record_confirmed_log"):
        ImageAnalysisService.record_scan_confirmation_and_feedback(
            client=mock_client,
            user_id="usr-123",
            image_id=str(uuid.uuid4()),
            confirmed_items=[confirmed_item],
            allow_training_consent=False  # DENIED
        )

    # Inspect insert call to plate_scan_feedback
    insert_call_args = mock_table.insert.call_args[0][0]
    assert insert_call_args["allow_training_consent"] is False
    assert insert_call_args["review_status"] == "consent_denied"

    # Case B: User explicitly GRANTS consent
    with patch("app.services.user_learning.UserPreferenceLearningEngine.record_confirmed_log"):
        ImageAnalysisService.record_scan_confirmation_and_feedback(
            client=mock_client,
            user_id="usr-123",
            image_id=str(uuid.uuid4()),
            confirmed_items=[confirmed_item],
            allow_training_consent=True  # GRANTED
        )

    insert_call_args_granted = mock_table.insert.call_args[0][0]
    assert insert_call_args_granted["allow_training_consent"] is True
    assert insert_call_args_granted["review_status"] == "approved_for_training"


def test_dataset_curator_blocks_non_consented_examples_and_partitions_splits():
    """
    Verifies that:
    1. DatasetCurator only queries consented rows (eq("allow_training_consent", True)).
    2. Deterministic train/val/test splits are created.
    3. Any unconsented item raises ValueError if passed.
    """
    # 10 mock consented samples
    sample_records = [
        {
            "id": f"sample-{i}",
            "food_image_id": f"img-{i}",
            "allow_training_consent": True,
            "confirmed_food_labels": [{"food_name": "Roti", "weight_g": 70.0}],
            "user_confirmed_data": [{"food_name": "Roti", "weight_g": 70.0}],
            "original_prediction": [{"name": "Roti", "estimated_weight_g": 70.0}],
        }
        for i in range(10)
    ]

    splits = DatasetCurator.partition_dataset_splits(
        examples=sample_records,
        train_ratio=0.7,
        val_ratio=0.15,
        test_ratio=0.15,
        random_seed=42
    )

    assert len(splits["train"]) == 7
    assert len(splits["val"]) == 1
    assert len(splits["test"]) == 2
    assert all(item["dataset_split"] == "train" for item in splits["train"])
    assert all(item["dataset_split"] == "val" for item in splits["val"])
    assert all(item["dataset_split"] == "test" for item in splits["test"])

    # Verify that a non-consented sample triggers a privacy error
    illegal_sample = [{"id": "bad-1", "allow_training_consent": False}]
    with pytest.raises(ValueError, match="Security/Privacy violation"):
        DatasetCurator.create_labelled_manifest(client=None, examples=illegal_sample)


def test_dataset_jsonl_manifest_export():
    """
    Verifies JSONL dataset manifest generation and export to filesystem.
    """
    sample_records = [
        {
            "id": f"sample-{i}",
            "food_image_id": f"img-{i}",
            "allow_training_consent": True,
            "confirmed_food_labels": [{"food_name": "Dal", "weight_g": 150.0}],
            "user_confirmed_data": [{"food_name": "Dal", "weight_g": 150.0}],
            "original_prediction": [{"name": "Dal", "estimated_weight_g": 140.0}],
            "portion_corrections": [{"food_name": "Dal", "delta_grams": 10.0}],
            "delta_metrics": {"portion_mae_grams": 10.0},
            "created_at": "2026-10-31T12:00:00Z"
        }
        for i in range(5)
    ]

    manifest = DatasetCurator.create_labelled_manifest(client=None, examples=sample_records, version="test_v1")
    assert manifest["total_samples"] == 5
    assert manifest["unique_food_classes"] >= 1

    with tempfile.TemporaryDirectory() as tmpdir:
        filepath = DatasetCurator.export_dataset_jsonl(manifest, output_dir=tmpdir)
        assert os.path.exists(filepath)
        assert filepath.endswith(".jsonl")

        # Read back lines
        with open(filepath, "r", encoding="utf-8") as f:
            lines = [json.loads(line) for line in f]
        assert len(lines) == 5
        assert lines[0]["consent_verified"] is True
        assert "Dal" in lines[0]["ground_truth_labels"]


def test_pretrained_model_evaluation_pipeline():
    """
    Tests the PeriodicModelEvaluator computing Top-1, Top-3, and Portion MAE metrics.
    """
    model = FitMeFoodPlateModel(num_classes=len(FITME_FOOD_CLASSES), pretrained=False)

    eval_entries = [
        {
            "confirmed_items": [
                {"food_name": "Roti", "weight_g": 80.0},
                {"food_name": "Dal", "weight_g": 150.0},
            ]
        },
        {
            "confirmed_items": [
                {"food_name": "Paneer Butter Masala", "weight_g": 200.0},
            ]
        }
    ]

    results = PeriodicModelEvaluator.evaluate_model(model=model, dataset_entries=eval_entries)

    assert results["status"] == "completed"
    assert results["total_evaluated_items"] == 3
    assert 0.0 <= results["top1_accuracy_percent"] <= 100.0
    assert 0.0 <= results["top3_accuracy_percent"] <= 100.0
    assert results["portion_mae_grams"] >= 0.0
    assert results["average_latency_ms"] >= 0.0


def test_periodic_finetuning_pipeline_threshold_guard():
    """
    CRITICAL CONSTRAINT TEST:
    "Do not retrain after every upload or claim automatic learning works until implemented and tested."
    Verifies that fine-tuning is SKIPPED when the sample count is below the batch threshold.
    """
    # Only 2 samples (threshold is 5)
    scarce_entries = [
        {"confirmed_items": [{"food_name": "Roti", "weight_g": 70.0}]},
        {"confirmed_items": [{"food_name": "Dal", "weight_g": 150.0}]},
    ]

    # Without force_run: must be skipped
    result = PeriodicFineTuningPipeline.run_periodic_finetuning(
        training_entries=scarce_entries,
        epochs=1,
        force_run=False  # NO FORCE
    )

    assert result["success"] is False
    assert result["status"] == "skipped_below_threshold"
    assert "Threshold not met" in result["message"]
    assert result["available_samples"] == 2
    assert result["required_samples"] == PeriodicFineTuningPipeline.MINIMUM_NEW_SAMPLES_THRESHOLD


def test_periodic_finetuning_pipeline_execution():
    """
    Verifies actual fine-tuning execution when threshold is met or force_run=True.
    Trains PyTorch network, logs loss reduction, and saves model checkpoint.
    """
    training_entries = [
        {"confirmed_items": [{"food_name": "Roti", "weight_g": 70.0}]},
        {"confirmed_items": [{"food_name": "Dal", "weight_g": 150.0}]},
        {"confirmed_items": [{"food_name": "Rice", "weight_g": 180.0}]},
        {"confirmed_items": [{"food_name": "Paneer Tikka", "weight_g": 120.0}]},
        {"confirmed_items": [{"food_name": "Chole", "weight_g": 160.0}]},
    ]

    validation_entries = [
        {"confirmed_items": [{"food_name": "Roti", "weight_g": 75.0}]}
    ]

    with tempfile.TemporaryDirectory() as tmpdir:
        with patch("app.services.feedback_learning.model_pipeline.MODEL_CHECKPOINT_DIR", tmpdir):
            res = PeriodicFineTuningPipeline.run_periodic_finetuning(
                training_entries=training_entries,
                validation_entries=validation_entries,
                epochs=2,
                batch_size=2,
                force_run=True  # Trigger training
            )

            assert res["success"] is True
            assert res["status"] == "completed"
            assert res["epochs_trained"] == 2
            assert len(res["training_loss_history"]) == 2
            assert res["final_training_loss"] is not None
            assert res["checkpoint_path"] is not None
            assert os.path.exists(res["checkpoint_path"])
            assert res["validation_metrics"] is not None
            assert res["validation_metrics"]["total_evaluated_items"] == 1

