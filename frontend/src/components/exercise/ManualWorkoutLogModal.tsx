"use client";

import React, { useState } from "react";
import { api } from "@/lib/api";
import { caloriesBurned } from "@/lib/exercise";
import { X, Flame, Clock, Dumbbell } from "lucide-react";

interface ManualWorkoutLogModalProps {
  userWeightKg: number;
  onClose: () => void;
  onSuccess: (logged: any) => void;
}

const COMMON_ACTIVITIES = [
  { name: "Brisk Walk", met: 3.8 },
  { name: "Jogging", met: 7.0 },
  { name: "Outdoor Cycling", met: 6.8 },
  { name: "Home Circuit", met: 5.0 },
  { name: "Yoga / Stretching", met: 2.8 },
  { name: "Stair Climbing", met: 6.5 },
  { name: "Gym Strength Training", met: 4.5 },
];

export default function ManualWorkoutLogModal({
  userWeightKg,
  onClose,
  onSuccess,
}: ManualWorkoutLogModalProps) {
  const [selectedActivity, setSelectedActivity] = useState(COMMON_ACTIVITIES[0]);
  const [customName, setCustomName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [calories, setCalories] = useState(() =>
    Math.round(caloriesBurned(3.8, userWeightKg || 70, 30 * 60))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDurationChange = (mins: number) => {
    const val = Math.max(1, Math.min(300, mins));
    setDurationMinutes(val);
    const calculated = Math.round(
      caloriesBurned(selectedActivity.met, userWeightKg || 70, val * 60)
    );
    setCalories(calculated);
  };

  const handleActivitySelect = (act: (typeof COMMON_ACTIVITIES)[0]) => {
    setSelectedActivity(act);
    const calculated = Math.round(
      caloriesBurned(act.met, userWeightKg || 70, durationMinutes * 60)
    );
    setCalories(calculated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);

    const name = customName.trim() || selectedActivity.name;
    const completedSeconds = durationMinutes * 60;

    try {
      const res = await api.logExerciseSession({
        name,
        completed_seconds: completedSeconds,
        calories_burned: Number(calories) || 0,
        met: selectedActivity.met,
        weight_kg_used: userWeightKg,
        status: "completed",
        planned_seconds: completedSeconds,
      });

      onSuccess(res.log);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to log workout. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Log Workout Manually"
    >
      <div className="relative w-full max-w-[460px] bg-white rounded-[28px] p-6 shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-[#eef1ee]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#eaf1ec] flex items-center justify-center text-[#22332d]">
              <Dumbbell className="w-5 h-5 text-[#7c9a7e]" />
            </div>
            <div>
              <h3 className="text-[18px] font-bold text-[#22332d] m-0">Log a workout</h3>
              <p className="text-[12px] text-[#5b6b64] m-0">For sessions done outside the app</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#5b6b64] hover:text-[#22332d] rounded-full hover:bg-[#f4f8f5]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Quick Activity Chips */}
          <div>
            <label className="text-[13px] font-bold text-[#22332d] block mb-2">
              Select Activity
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_ACTIVITIES.map((act) => {
                const isSelected = selectedActivity.name === act.name;
                return (
                  <button
                    key={act.name}
                    type="button"
                    onClick={() => handleActivitySelect(act)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      isSelected
                        ? "bg-[#22332d] text-white"
                        : "bg-[#eaf1ec] text-[#22332d] hover:bg-[#dfe6e1]"
                    }`}
                  >
                    {act.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Name (Optional) */}
          <div>
            <label className="text-[13px] font-semibold text-[#5b6b64] block mb-1">
              Custom Name (Optional)
            </label>
            <input
              type="text"
              placeholder={selectedActivity.name}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-[14px] border border-[#dfe6e1] text-[14px] text-[#22332d] focus:border-[#7c9a7e] focus:outline-none"
            />
          </div>

          {/* Duration & Calories Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[13px] font-semibold text-[#5b6b64] block mb-1">
                Duration (minutes)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={durationMinutes}
                  onChange={(e) => handleDurationChange(Number(e.target.value))}
                  className="w-full h-11 px-3.5 pr-8 rounded-[14px] border border-[#dfe6e1] text-[15px] font-bold text-[#22332d] focus:border-[#7c9a7e] focus:outline-none"
                />
                <Clock className="w-4 h-4 text-[#889989] absolute right-3 top-3.5 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#5b6b64] block mb-1">
                Calories Burned (kcal)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="3000"
                  value={calories}
                  onChange={(e) => setCalories(Number(e.target.value))}
                  className="w-full h-11 px-3.5 pr-8 rounded-[14px] border border-[#dfe6e1] text-[15px] font-bold text-[#22332d] focus:border-[#7c9a7e] focus:outline-none"
                />
                <Flame className="w-4 h-4 text-[#e57373] absolute right-3 top-3.5 pointer-events-none" />
              </div>
            </div>
          </div>

          <p className="text-[12px] text-[#5b6b64] m-0">Calories burned are estimates.</p>

          {/* Action buttons */}
          <div className="flex gap-2.5 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-full border border-[#dfe6e1] text-[14px] font-semibold text-[#22332d] hover:bg-[#f4f8f5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 h-11 rounded-full bg-[#22332d] text-white text-[14px] font-semibold hover:bg-[#1a2823] transition-all shadow-md"
            >
              {isSaving ? "Saving..." : "Save to log"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
