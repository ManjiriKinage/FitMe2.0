"""Supabase Ingestion Script for INDB Normalized CSV Data.
Loads and upserts:
1. unit_conversions.csv
2. ingredients.csv
3. recipes.csv
4. recipe_ingredients.csv

Performs batch processing, logs progress, and reports inserted/updated/rejected counts.
"""
import os
import sys
import json
import logging
import pandas as pd
from typing import Dict, Any, List

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings
from app.db.supabase import get_supabase_admin_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("SupabaseLoader")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RECIPES_CSV = os.path.join(DATA_DIR, "recipes.csv")
INGREDIENTS_CSV = os.path.join(DATA_DIR, "ingredients.csv")
RECIPE_INGS_CSV = os.path.join(DATA_DIR, "recipe_ingredients.csv")
UNITS_CSV = os.path.join(DATA_DIR, "unit_conversions.csv")

BATCH_SIZE = 100

def load_unit_conversions(client) -> int:
    logger.info("Ingesting unit_conversions.csv...")
    if not os.path.exists(UNITS_CSV):
        logger.error(f"File not found: {UNITS_CSV}")
        return 0
    df = pd.read_csv(UNITS_CSV)
    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    
    upserted = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            res = client.table("unit_conversions").upsert(batch, on_conflict="unit_name").execute()
            upserted += len(res.data or [])
        except Exception as e:
            logger.warning(f"Error inserting unit_conversions batch {i}: {e}")
    logger.info(f"Unit conversions processed: {upserted}/{len(records)}")
    return upserted

def load_ingredients(client) -> Dict[str, str]:
    logger.info("Ingesting ingredients.csv...")
    if not os.path.exists(INGREDIENTS_CSV):
        logger.error(f"File not found: {INGREDIENTS_CSV}")
        return {}
    df = pd.read_csv(INGREDIENTS_CSV)
    df["aliases"] = df["aliases"].apply(lambda x: json.loads(x) if isinstance(x, str) else [])
    records = df.where(pd.notnull(df), None).to_dict(orient="records")

    code_to_id = {}
    upserted = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            res = client.table("ingredients").upsert(batch, on_conflict="source_food_code").execute()
            data = res.data or []
            upserted += len(data)
            for row in data:
                code_to_id[row["source_food_code"]] = row["id"]
        except Exception as e:
            logger.warning(f"Error inserting ingredients batch {i}: {e}")
    logger.info(f"Ingredients processed: {upserted}/{len(records)}")
    return code_to_id

def load_recipes(client) -> Dict[str, str]:
    logger.info("Ingesting recipes.csv...")
    if not os.path.exists(RECIPES_CSV):
        logger.error(f"File not found: {RECIPES_CSV}")
        return {}
    df = pd.read_csv(RECIPES_CSV)
    df["aliases"] = df["aliases"].apply(lambda x: json.loads(x) if isinstance(x, str) else [])
    records = df.where(pd.notnull(df), None).to_dict(orient="records")

    code_to_id = {}
    upserted = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            res = client.table("recipes").upsert(batch, on_conflict="source_recipe_code").execute()
            data = res.data or []
            upserted += len(data)
            for row in data:
                code_to_id[row["source_recipe_code"]] = row["id"]
        except Exception as e:
            logger.warning(f"Error inserting recipes batch {i}: {e}")
    logger.info(f"Recipes processed: {upserted}/{len(records)}")
    return code_to_id

def load_recipe_ingredients(client, recipe_id_map: Dict[str, str], ingredient_id_map: Dict[str, str]) -> int:
    logger.info("Ingesting recipe_ingredients.csv...")
    if not os.path.exists(RECIPE_INGS_CSV):
        logger.error(f"File not found: {RECIPE_INGS_CSV}")
        return 0
    df = pd.read_csv(RECIPE_INGS_CSV)
    
    # Map foreign keys
    df["recipe_id"] = df["source_recipe_code"].map(recipe_id_map)
    df["ingredient_id"] = df["ingredient_food_code"].map(ingredient_id_map)
    
    # Drop rows where recipe_id could not be resolved
    valid_df = df.dropna(subset=["recipe_id"]).copy()
    records = valid_df.where(pd.notnull(valid_df), None).to_dict(orient="records")

    inserted = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            res = client.table("recipe_ingredients").insert(batch).execute()
            inserted += len(res.data or [])
        except Exception as e:
            logger.warning(f"Error inserting recipe_ingredients batch {i}: {e}")
    logger.info(f"Recipe ingredients inserted: {inserted}/{len(records)}")
    return inserted

def run_import():
    logger.info("Connecting to Supabase...")
    client = get_supabase_admin_client()
    if not client:
        logger.error("Could not initialize Supabase client. Check SUPABASE_URL and keys.")
        return

    # Check table existence before attempting load
    try:
        client.table("recipes").select("id").limit(1).execute()
    except Exception as e:
        logger.error("Supabase tables do not exist yet in your project.")
        logger.info("Please open Supabase SQL Editor and run: supabase/migrations/002_indb_tables.sql")
        logger.info("Once the migration has been executed, rerun this ingestion script.")
        return

    load_unit_conversions(client)
    ing_map = load_ingredients(client)
    rec_map = load_recipes(client)
    if rec_map:
        load_recipe_ingredients(client, rec_map, ing_map)

    logger.info("Data ingestion completed successfully.")

if __name__ == "__main__":
    run_import()
