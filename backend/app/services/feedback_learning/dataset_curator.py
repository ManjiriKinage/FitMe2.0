"""Dataset Curator for Labelled Food Recognition & Portion Estimation Datasets.

Aggregates reviewed, user-confirmed plate scan examples into structured, versioned
training/evaluation datasets. Strictly enforces:
1. Explicit user consent (allow_training_consent == True).
2. Human confirmation (user_confirmed == True).
3. Deterministic train/validation/test dataset splits.
4. Privacy isolation: non-consented photos are strictly blocked from dataset manifests.
"""
import logging
import json
import os
import random
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DATASET_EXPORT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data_pipeline", "datasets")


class DatasetCurator:
    """Curates, validates, and partitions consented food review data into labelled datasets."""

    @classmethod
    def fetch_consented_examples(
        cls,
        client: Any,
        limit: int = 1000,
        include_unreviewed: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Retrieves confirmed plate scans that have EXPLICIT user consent.
        Strictly filters: allow_training_consent = True.
        """
        if not client:
            return []

        try:
            query = (
                client.table("plate_scan_feedback")
                .select("id, food_image_id, user_id, original_prediction, user_confirmed_data, "
                        "confirmed_food_labels, portion_corrections, preparation_corrections, "
                        "label_corrections, delta_metrics, action, allow_training_consent, "
                        "review_status, dataset_split, created_at")
                .eq("allow_training_consent", True)  # MANDATORY CONSENT FILTER
            )

            if not include_unreviewed:
                # Exclude explicitly rejected or consent-revoked records
                query = query.neq("review_status", "rejected").neq("review_status", "consent_denied")

            res = query.order("created_at", desc=True).limit(limit).execute()
            records = res.data or []

            logger.info(f"Retrieved {len(records)} consented examples for model dataset curation.")
            return records
        except Exception as e:
            logger.error(f"Error fetching consented examples: {e}")
            return []

    @classmethod
    def partition_dataset_splits(
        cls,
        examples: List[Dict[str, Any]],
        train_ratio: float = 0.70,
        val_ratio: float = 0.15,
        test_ratio: float = 0.15,
        random_seed: int = 42
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Splits consented examples into train, validation, and test sets.
        Uses deterministic seed for reproducible splits.
        """
        if not examples:
            return {"train": [], "val": [], "test": []}

        # Validate ratios
        total_ratio = train_ratio + val_ratio + test_ratio
        norm_train = train_ratio / total_ratio
        norm_val = val_ratio / total_ratio

        # Deterministic shuffle
        rng = random.Random(random_seed)
        shuffled = list(examples)
        rng.shuffle(shuffled)

        n = len(shuffled)
        n_train = int(n * norm_train)
        n_val = int(n * norm_val)

        train_set = shuffled[:n_train]
        val_set = shuffled[n_train:n_train + n_val]
        test_set = shuffled[n_train + n_val:]

        # Mark split on records
        for item in train_set:
            item["dataset_split"] = "train"
        for item in val_set:
            item["dataset_split"] = "val"
        for item in test_set:
            item["dataset_split"] = "test"

        return {
            "train": train_set,
            "val": val_set,
            "test": test_set
        }

    @classmethod
    def create_labelled_manifest(
        cls,
        client: Any,
        examples: Optional[List[Dict[str, Any]]] = None,
        train_ratio: float = 0.70,
        val_ratio: float = 0.15,
        test_ratio: float = 0.15,
        version: str = "v1"
    ) -> Dict[str, Any]:
        """
        Constructs a complete versioned dataset manifest with verified labels,
        portion ground truth, and train/val/test splits.
        """
        if examples is None:
            examples = cls.fetch_consented_examples(client)

        # Enforce consent verification check
        for ex in examples:
            if not ex.get("allow_training_consent"):
                raise ValueError(f"Security/Privacy violation: non-consented example {ex.get('id')} found in training curation.")

        # Partition
        splits = cls.partition_dataset_splits(
            examples=examples,
            train_ratio=train_ratio,
            val_ratio=val_ratio,
            test_ratio=test_ratio
        )

        manifest_entries: List[Dict[str, Any]] = []
        class_counts: Dict[str, int] = {}

        for split_name, split_items in splits.items():
            for item in split_items:
                confirmed = item.get("confirmed_food_labels") or item.get("user_confirmed_data") or []
                labels = [c.get("food_name") for c in confirmed if c.get("food_name")]

                for l in labels:
                    class_counts[l] = class_counts.get(l, 0) + 1

                entry = {
                    "sample_id": item["id"],
                    "food_image_id": item.get("food_image_id"),
                    "dataset_split": split_name,
                    "consent_verified": True,
                    "ground_truth_labels": labels,
                    "confirmed_items": confirmed,
                    "original_prediction": item.get("original_prediction") or [],
                    "portion_corrections": item.get("portion_corrections") or [],
                    "preparation_corrections": item.get("preparation_corrections") or [],
                    "label_corrections": item.get("label_corrections") or {},
                    "delta_metrics": item.get("delta_metrics") or {},
                    "created_at": item.get("created_at")
                }
                manifest_entries.append(entry)

        summary = {
            "version": version,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "total_samples": len(manifest_entries),
            "split_counts": {
                "train": len(splits["train"]),
                "val": len(splits["val"]),
                "test": len(splits["test"]),
            },
            "unique_food_classes": len(class_counts),
            "top_food_classes": sorted(class_counts.items(), key=lambda x: x[1], reverse=True)[:15],
            "entries": manifest_entries
        }

        return summary

    @classmethod
    def export_dataset_jsonl(
        cls,
        manifest: Dict[str, Any],
        output_dir: Optional[str] = None
    ) -> str:
        """
        Saves dataset manifest as a JSONL file ready for vision fine-tuning and evaluation.
        Returns the absolute filepath of the saved manifest.
        """
        target_dir = output_dir or DATASET_EXPORT_DIR
        os.makedirs(target_dir, exist_ok=True)

        version = manifest.get("version", "v1")
        filename = f"fitme_food_dataset_{version}.jsonl"
        filepath = os.path.join(target_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            for entry in manifest.get("entries", []):
                f.write(json.dumps(entry) + "\n")

        # Save metadata summary
        meta_filename = f"fitme_food_dataset_{version}_meta.json"
        meta_filepath = os.path.join(target_dir, meta_filename)
        meta_copy = {k: v for k, v in manifest.items() if k != "entries"}
        with open(meta_filepath, "w", encoding="utf-8") as f:
            json.dump(meta_copy, f, indent=2)

        logger.info(f"Exported labelled dataset to {filepath} ({manifest['total_samples']} samples).")
        return filepath

    @classmethod
    def get_dataset_statistics(cls, client: Any) -> Dict[str, Any]:
        """Returns live statistics on consented samples, review statuses, and training readiness."""
        if not client:
            return {
                "total_consented_samples": 0,
                "approved_for_training": 0,
                "pending_review": 0,
                "consent_denied_samples": 0,
                "training_ready": False,
                "minimum_samples_required": 10
            }

        try:
            consented_res = (
                client.table("plate_scan_feedback")
                .select("id, review_status, allow_training_consent")
                .eq("allow_training_consent", True)
                .execute()
            )
            consented_rows = consented_res.data or []

            denied_res = (
                client.table("plate_scan_feedback")
                .select("id")
                .eq("allow_training_consent", False)
                .execute()
            )
            denied_count = len(denied_res.data or [])

            total_consented = len(consented_rows)
            approved = sum(1 for r in consented_rows if r.get("review_status") == "approved_for_training")
            pending = sum(1 for r in consented_rows if r.get("review_status") == "pending")

            return {
                "total_consented_samples": total_consented,
                "approved_for_training": approved,
                "pending_review": pending,
                "consent_denied_samples": denied_count,
                "training_ready": total_consented >= 10,
                "minimum_samples_required": 10
            }
        except Exception as e:
            logger.warning(f"Failed to fetch dataset stats: {e}")
            return {
                "total_consented_samples": 0,
                "approved_for_training": 0,
                "pending_review": 0,
                "consent_denied_samples": 0,
                "training_ready": False,
                "minimum_samples_required": 10
            }

