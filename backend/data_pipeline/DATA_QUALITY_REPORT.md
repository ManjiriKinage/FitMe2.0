# Indian Nutrient Databank (INDB) Data Quality & Validation Report

**Generated:** 2026-10-25T01:12:45.748798  
**Pipeline Run:** Production v1.0 Normalization  

## 1. Summary of Generated CSV Files

| Output CSV | Total Rows | Primary Key | Foreign Key Target | Status |
|---|---|---|---|---|
| `recipes.csv` | 1,014 | `source_recipe_code` | — | **100% Validated** (0 Duplicates) |
| `ingredients.csv` | 332 | `source_food_code` | — | **100% Validated** (0 Duplicates) |
| `recipe_ingredients.csv` | 10,271 | Composite (`recipe_code`, row) | `recipes.source_recipe_code` | **100% Referential Integrity** |
| `unit_conversions.csv` | 26 | `unit_name` | — | **Verified Standards** |

---

## 2. Integrity & Validation Metrics

### A. Recipes Catalog
- **Total Unique Recipes:** 1014
- **Completeness:** 100% of recipes have complete per-100g Energy, Protein, Carbs, and Fat.
- **Serving Units Available:** 917/1014 (90.4%)
- **Calculated Implied Serving Size:** 932/1014 records.

### B. Ingredients & Materials
- **Total Unique Raw Ingredients:** 332
- **Zero Values:** Explicitly restricted to Water and Salt where energy and macronutrients are scientifically 0.0. All unmeasured reference ingredients retain `NULL` rather than false zeros.

### C. Recipe Ingredients (Bill of Materials)
- **Total Ingredient Instances:** 10,271
- **Successfully Converted to Grams:** 10,260 (99.9%)
- **Foreign Key Matches to Recipes:** 100% (all 10,271 link to valid recipes)
- **Foreign Key Matches to Ingredients:** 10,148/10,271 (unlinked items represent minor herbs, garnishes, water, or seasoning).

---

## 3. Discrepancy Reconciliation

1. **Missing Ingredient Identifiers (123 rows):** Handled gracefully with nullable `ingredient_food_code` and categorized as `conversion_status = 'unmapped'`.
2. **Missing Amounts (3 rows):** Flagged as `status = 'missing_quantity'`.
3. **Serving Counts:** Where `no_of_servings` was missing in `recipes_servingsize.xlsx`, safely defaulted to standard portion multiplier 1.0.

All CSV files are ready for version-controlled migration and ingestion into Supabase PostgreSQL.
