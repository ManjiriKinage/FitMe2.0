# FitMe V1 — AI-Powered Personalized Calorie Tracker

FitMe is a full-stack, responsive health and nutrition web application designed for mindful calorie tracking, evidence-based nutrition science, and AI-assisted food logging.

---

## 🎨 Design Theme & Aesthetics

FitMe implements an organic, soothing aesthetic inspired by modern health & diet dashboards:

| Color | Hex | Purpose |
|---|---|---|
| **Sage** | `#789879` | Primary brand accent, active state highlights, buttons |
| **Mint** | `#E5F2E7` | Card backgrounds, badge containers, soft borders |
| **Cream** | `#FAF9F4` | App canvas background, input surfaces |
| **Charcoal** | `#26352D` | Sleek sidebar, dark cards, high-contrast headings |

- **Responsive Layout:** Desktop vertical left navigation with circular "Calories Budget" widget; mobile adaptive sticky header and bottom icon bar.
- **Micro-Interactions:** Smooth card hover elevations, live Mifflin-St Jeor calculation preview, and interactive meal breakdowns.

---

## 🏗️ Technology Architecture

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Lucide Icons
- **Backend:** Python FastAPI, Pydantic v2, Uvicorn
- **Database & Auth:** Supabase PostgreSQL with Row Level Security (RLS) & Supabase Auth
- **AI Integration:** Google Gemini AI with high-accuracy Indian food heuristic fallback

---

## 📁 Repository Structure

```
FitMe/
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── home/page.tsx
│   │   │   │   ├── goals/page.tsx
│   │   │   │   └── profile/page.tsx
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── CalorieCard.tsx
│   │   │   ├── CalorieProgress.tsx
│   │   │   ├── FoodLogForm.tsx
│   │   │   ├── FoodLogList.tsx
│   │   │   ├── Navbar.tsx
│   │   │   └── NutritionSummary.tsx
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── supabase.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── middleware.ts
│   ├── .env.example
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── dashboard.py
│   │   │   ├── food.py
│   │   │   ├── goals.py
│   │   │   └── profile.py
│   │   ├── core/
│   │   │   └── config.py
│   │   ├── db/
│   │   │   └── supabase.py
│   │   ├── schemas/
│   │   │   ├── food.py
│   │   │   ├── goals.py
│   │   │   └── user.py
│   │   ├── services/
│   │   │   ├── calorie_calculator.py
│   │   │   ├── food_ai.py
│   │   │   └── nutrition_service.py
│   │   └── main.py
│   ├── tests/
│   │   ├── test_auth.py
│   │   ├── test_calories.py
│   │   └── test_food.py
│   ├── .env.example
│   └── requirements.txt
│
├── supabase/
│   └── schema.sql
├── pytest.ini
└── README.md
```

---

## 🚀 Setup & Execution Guide

### 1. Supabase Database & Auth Setup

1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard) and open your project.
2. Go to the **SQL Editor** tab from the left navigation.
3. Open `supabase/schema.sql` from this repository, copy its contents, paste it into the SQL Editor, and click **Run**.
   - This creates the `profiles` table, `food_logs` table, indexes, updated_at triggers, and enables Row Level Security (RLS) policies so users can only access their own data.
4. Go to **Project Settings** -> **API** to copy your:
   - `Project URL`
   - `anon public` key
   - `service_role secret` key (keep this strictly on the backend!)
5. In **Authentication** -> **Providers** -> **Email**:
   - Ensure Email provider is enabled.
   - For instant local testing without verifying emails, you can optionally disable "Confirm email".

---

### 2. Backend Setup (FastAPI)

1. Create and activate a Python virtual environment:
   ```bash
   cd d:\projects2\FitMe
   python -m venv venv
   .\venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r backend\requirements.txt
   ```
3. Create your `backend\.env` file (copy from `backend\.env.example`):
   ```ini
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   GEMINI_API_KEY=your-gemini-api-key
   ENVIRONMENT=development
   PORT=8000
   FRONTEND_URL=http://localhost:3000
   ```
4. Run unit tests to verify the calorie and food engines:
   ```bash
   .\venv\Scripts\pytest -v
   ```
5. Start the FastAPI server:
   ```bash
   .\venv\Scripts\uvicorn app.main:app --reload --port 8000
   ```
   API docs will be available at: `http://localhost:8000/docs`

---

### 3. Frontend Setup (Next.js)

1. Navigate to the frontend directory:
   ```bash
   cd d:\projects2\FitMe\frontend
   ```
2. Install packages:
   ```bash
   npm install
   ```
3. Create your `frontend\.env.local` file:
   ```ini
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000` in your browser.

---

## 🧠 Scientific Calorie Recommendation Engine

FitMe calculates Basal Metabolic Rate (BMR) using the clinically validated **Mifflin–St Jeor equation**:

- **Men:** $BMR = (10 \times \text{weight in kg}) + (6.25 \times \text{height in cm}) - (5 \times \text{age in years}) + 5$
- **Women:** $BMR = (10 \times \text{weight in kg}) + (6.25 \times \text{height in cm}) - (5 \times \text{age in years}) - 161$
- **Other / Neutral:** Midpoint offset ($-78$)

Total Daily Energy Expenditure (TDEE) is calculated using validated physical activity multipliers (1.2 to 1.9).

- **Lose Weight:** Sustainable deficit of 15–20% (clamped at a maximum safe deficit of ~450–500 kcal).
- **Gain Muscle:** Conservative surplus of ~10% (150–300 kcal) paired with resistance training recommendations and protein targets ($1.8 - 2.0\text{g}/\text{kg}$).
- **Maintain Weight:** Balanced intake targeting estimated TDEE.
- **Safety Floors:** Enforces NIH/WHO safety limits (never drops below 1,500 kcal/day for males or 1,200 kcal/day for females).
- **Adolescent Guard:** Prompts users under 18 to seek professional guidance.

---

## 🍛 AI Food Calorie Estimation

The AI food estimator supports natural everyday meal descriptions with deep support for Indian serving units:
- *"2 medium chapatis with 1 bowl dal"*
- *"1 plate of poha"*
- *"1 homemade paneer bhurji"*
- *"1 cup cooked rice with chicken curry"*

Returns structured portions, calories, protein, carbs, fats, preparation assumptions, and uncertainty flags. Users can review, fine-tune, or adjust quantities before saving to their daily log.
