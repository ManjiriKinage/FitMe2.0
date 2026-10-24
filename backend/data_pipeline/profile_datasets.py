"""Data Profiling Script for Indian Nutrient Databank (INDB) & Recipe Datasets.
Analyzes sheets, columns, data types, missing values, duplicates, keys, and cross-relationships.
"""
import os
import sys
import pandas as pd
import numpy as np

BASE_DIR = r"d:\projects2\FitMe"
EXCEL_FILES = {
    "INDB": os.path.join(BASE_DIR, "INDB.xlsx"),
    "recipes": os.path.join(BASE_DIR, "recipes.xlsx"),
    "recipes_names": os.path.join(BASE_DIR, "recipes_names.xlsx"),
    "recipes_servingsize": os.path.join(BASE_DIR, "recipes_servingsize.xlsx"),
    "Units": os.path.join(BASE_DIR, "Units.xlsx")
}

def profile_indb():
    print("\n" + "="*70)
    print("PROFILING INDB.xlsx")
    print("="*70)
    df = pd.read_excel(EXCEL_FILES["INDB"])
    print(f"Total Rows: {len(df)}, Total Columns: {len(df.columns)}")
    print(f"Unique food_codes: {df['food_code'].nunique()} (Duplicates: {df['food_code'].duplicated().sum()})")
    print(f"Unique food_names: {df['food_name'].nunique()} (Duplicates: {df['food_name'].duplicated().sum()})")
    print(f"Primary sources: {df['primarysource'].value_counts().to_dict()}")
    
    # Key macros summary (per 100g)
    print("\nPer 100g Nutrition Stats:")
    print(df[['energy_kcal', 'carb_g', 'protein_g', 'fat_g', 'fibre_g']].describe().round(2))
    
    # Serving unit summary
    print("\nServing Units:")
    print(df['servings_unit'].value_counts().head(10).to_dict())
    print("Missing servings_unit:", df['servings_unit'].isnull().sum())
    
    # Unit serving macros stats
    print("\nPer Serving Nutrition Stats:")
    print(df[['unit_serving_energy_kcal', 'unit_serving_carb_g', 'unit_serving_protein_g', 'unit_serving_fat_g']].describe().round(2))
    
    # Compare per 100g vs per serving ratio to deduce serving weight in grams
    ratios = df['unit_serving_energy_kcal'] / df['energy_kcal'].replace(0, np.nan)
    implied_weight_g = ratios * 100.0
    print("\nImplied Serving Weight (g) stats (serving_kcal / 100g_kcal * 100):")
    print(implied_weight_g.describe().round(2))
    
    return df

def profile_recipes():
    print("\n" + "="*70)
    print("PROFILING recipes.xlsx")
    print("="*70)
    df = pd.read_excel(EXCEL_FILES["recipes"])
    print(f"Total Rows: {len(df)}, Total Columns: {len(df.columns)}")
    print(f"Columns: {df.columns.tolist()}")
    print(f"Unique recipe_codes: {df['recipe_code'].nunique()}")
    print(f"Unique ingredients (food_code): {df['food_code'].nunique()} (Null food_code: {df['food_code'].isnull().sum()})")
    print(f"Unique ingredient names (food_name): {df['food_name'].nunique()} (Null food_name: {df['food_name'].isnull().sum()})")
    print(f"Null amount: {df['amount'].isnull().sum()}, Null unit: {df['unit'].isnull().sum()}")
    print("\nTop 15 Units in recipes:")
    print(df['unit'].value_counts().head(15).to_dict())
    
    # Check null food_codes
    null_fc = df[df['food_code'].isnull()]
    if not null_fc.empty:
        print(f"\nSample of rows with missing food_code ({len(null_fc)} rows):")
        print(null_fc[['recipe_code', 'recipe_name', 'ingredient_name_org', 'amount', 'unit']].head(10))
    
    return df

def profile_recipes_names():
    print("\n" + "="*70)
    print("PROFILING recipes_names.xlsx")
    print("="*70)
    df = pd.read_excel(EXCEL_FILES["recipes_names"])
    print(f"Total Rows: {len(df)}, Total Columns: {len(df.columns)}")
    print(f"Columns: {df.columns.tolist()}")
    print(f"Unique recipe_codes: {df['recipe_code'].nunique()} (Duplicates: {df['recipe_code'].duplicated().sum()})")
    print(f"Primary sources: {df['primarysource'].value_counts().to_dict()}")
    return df

def profile_recipes_servingsize():
    print("\n" + "="*70)
    print("PROFILING recipes_servingsize.xlsx")
    print("="*70)
    df = pd.read_excel(EXCEL_FILES["recipes_servingsize"])
    print(f"Total Rows: {len(df)}, Total Columns: {len(df.columns)}")
    print(f"Columns: {df.columns.tolist()}")
    print(f"Null no_of_servings: {df['no_of_servings'].isnull().sum()}")
    print(f"Null size_of_servings: {df['size_of_servings'].isnull().sum()}")
    print(f"Null servings_unit: {df['servings_unit'].isnull().sum()}")
    print("\nTop 10 servings units:")
    print(df['servings_unit'].value_counts().head(10).to_dict())
    print("\nSample rows:")
    print(df[['recipe_code', 'recipe_name', 'no_of_servings', 'size_of_servings', 'servings_unit']].head(10))
    return df

def profile_units():
    print("\n" + "="*70)
    print("PROFILING Units.xlsx")
    print("="*70)
    df = pd.read_excel(EXCEL_FILES["Units"])
    print(f"Total Rows: {len(df)}, Total Columns: {len(df.columns)}")
    print(f"Columns: {df.columns.tolist()}")
    valid = df.dropna(subset=['Food items', 'Units'], how='all')
    print(f"Non-empty rows: {len(valid)}")
    print("\nFirst 20 non-empty rows:")
    for idx, r in valid.head(25).iterrows():
        print(f"  Row {idx}: Food items='{r.get('Food items')}', Units='{r.get('Units')}', Units.1='{r.get('Units.1')}', Remarks='{r.get('Remarks')}', Source='{r.get('Source')}'")
    return df

def cross_validation(indb, recipes, rnames, rserv):
    print("\n" + "="*70)
    print("CROSS-DATASET RELATIONSHIPS & VALIDATION")
    print("="*70)
    indb_codes = set(indb['food_code'])
    rname_codes = set(rnames['recipe_code'])
    rserv_codes = set(rserv['recipe_code'])
    rec_recipe_codes = set(recipes['recipe_code'])
    
    print(f"INDB codes: {len(indb_codes)}")
    print(f"recipes_names codes: {len(rname_codes)}")
    print(f"recipes_servingsize codes: {len(rserv_codes)}")
    print(f"recipes.xlsx recipe codes: {len(rec_recipe_codes)}")
    
    print(f"recipes_names == INDB codes: {rname_codes == indb_codes}")
    print(f"recipes_servingsize == INDB codes: {rserv_codes == indb_codes}")
    print(f"recipes.xlsx recipe codes subset of INDB: {rec_recipe_codes.issubset(indb_codes)}")
    print(f"Any recipe in INDB missing from recipes.xlsx: {len(indb_codes - rec_recipe_codes)}")
    
    # Check ingredient food_codes
    recipe_food_codes = set(recipes['food_code'].dropna())
    print(f"Distinct ingredient food_codes in recipes.xlsx: {len(recipe_food_codes)}")
    
    # Check serving size match between INDB and recipes_servingsize
    merged_serv = pd.merge(indb[['food_code', 'servings_unit', 'unit_serving_energy_kcal']], 
                           rserv[['recipe_code', 'no_of_servings', 'size_of_servings', 'servings_unit']], 
                           left_on='food_code', right_on='recipe_code')
    print(f"Merged INDB and Servingsize count: {len(merged_serv)}")
    unit_matches = (merged_serv['servings_unit_x'] == merged_serv['servings_unit_y']).sum()
    print(f"Servings unit exact matches between INDB & recipes_servingsize: {unit_matches}/{len(merged_serv)}")

if __name__ == "__main__":
    indb = profile_indb()
    recipes = profile_recipes()
    rnames = profile_recipes_names()
    rserv = profile_recipes_servingsize()
    units = profile_units()
    cross_validation(indb, recipes, rnames, rserv)
