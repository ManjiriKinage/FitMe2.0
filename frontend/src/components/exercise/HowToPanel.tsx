"use client";

import React, { useRef } from "react";
import { WorkoutPlanItem } from "@/lib/exercise";
import { AlertTriangle, ShieldAlert, X, ChevronRight, Play } from "lucide-react";
import ExerciseVideo from "@/components/exercise/ExerciseVideo";

interface HowToPanelProps {
  item: WorkoutPlanItem;
  currentIndex: number;
  totalItems: number;
  onClose: () => void;
  onNext?: () => void;
  onStartSetTimer?: (item: WorkoutPlanItem) => void;
}

export default function HowToPanel({
  item,
  currentIndex,
  totalItems,
  onClose,
  onNext,
  onStartSetTimer,
}: HowToPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 grid grid-cols-1 lg:grid-cols-[1fr_1.25fr] gap-7 items-start transition-all"
      aria-label={`How to do ${item.name}`}
    >
      {/* Left Column: Video Demonstration & Muscles Badges */}
      <div className="flex flex-col gap-3.5">
        {/* YouTube Demo Player */}
        <ExerciseVideo
          exerciseId={item.id}
          exerciseSlug={item.slug}
          exerciseName={item.name}
        />

        {/* Muscles & Prescription Badges */}
        <div className="flex gap-2 flex-wrap items-center mt-1">
          {item.howTo.muscles.map((muscle) => (
            <span
              key={muscle}
              className="inline-block rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d] capitalize"
            >
              {muscle.replace("_", " ")}
            </span>
          ))}
          {item.sets && item.reps && item.sets > 1 && item.reps > 1 && (
            <span className="inline-block rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d]">
              {item.sets} × {item.reps} reps
            </span>
          )}
          <span className="inline-block rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d]">
            Rest 30 sec
          </span>
        </div>

        {/* Clinical Note */}
        <p className="text-[12px] text-[#5b6b64] leading-normal m-0">
          Movement guide with verified clinical safety cues. Calories burned are estimates.
        </p>
      </div>

      {/* Right Column: Numbered Steps, Common Mistakes, Easier/Harder, Safety Line */}
      <div className="flex flex-col gap-4">
        {/* Header with Title and Counter */}
        <div className="flex justify-between items-center pb-1 border-b border-[#eef1ee]">
          <div>
            <h3 className="text-[20px] font-bold text-[#22332d]">
              How to do it: {item.name.toLowerCase()}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium text-[#5b6b64]">
              {currentIndex + 1} of {totalItems}
            </span>
            <button
              onClick={onClose}
              className="text-[#5b6b64] hover:text-[#22332d] p-1 rounded-full hover:bg-[#f4f8f5] transition-colors"
              aria-label="Close how-to guide"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Numbered Steps */}
        <ol className="flex flex-col gap-2.5 pl-5 m-0 text-[14px] text-[#22332d] leading-relaxed list-decimal">
          {item.howTo.steps.map((step, idx) => (
            <li key={idx} className="pl-1">
              {step}
            </li>
          ))}
        </ol>

        {/* 2 Pastel Boxes: Common Mistakes & Easier/Harder */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
          <div className="bg-[#f4f8f5] rounded-[16px] p-3.5 border border-[#eaf1ec]">
            <b className="text-[13px] text-[#22332d] font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#889989]" />
              Common mistakes
            </b>
            <p className="text-[13px] text-[#5b6b64] mt-1.5 leading-normal">
              {item.howTo.mistakes.length > 0
                ? item.howTo.mistakes.join(" ")
                : "Rushing repetitions, rounding the back, or holding breath."}
            </p>
          </div>

          <div className="bg-[#f4f8f5] rounded-[16px] p-3.5 border border-[#eaf1ec]">
            <b className="text-[13px] text-[#22332d] font-bold">Easier / harder</b>
            <p className="text-[13px] text-[#5b6b64] mt-1.5 leading-normal">
              {item.howTo.easier || item.howTo.harder ? (
                <>
                  {item.howTo.easier && <span>{item.howTo.easier} </span>}
                  {item.howTo.harder && <span>Or {item.howTo.harder.toLowerCase()}</span>}
                </>
              ) : (
                "Adjust tempo, reduce range of motion for ease, or add pauses to increase difficulty."
              )}
            </p>
          </div>
        </div>

        {/* Safety Line */}
        <div className="flex items-center gap-2 text-[13px] text-[#5b6b64] mt-0.5">
          <ShieldAlert className="w-4 h-4 text-[#7c9a7e] flex-shrink-0" />
          <span>Stop if you feel sharp pain or dizziness.</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-2 pt-2 border-t border-[#eef1ee]">
          {onStartSetTimer && (
            <button
              type="button"
              onClick={() => onStartSetTimer(item)}
              className="h-11 px-5 rounded-full bg-[#22332d] text-white text-[14px] font-semibold hover:bg-[#1a2823] transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start set timer</span>
            </button>
          )}

          {onNext && currentIndex < totalItems - 1 && (
            <button
              type="button"
              onClick={onNext}
              className="h-11 px-5 rounded-full border border-[#dfe6e1] bg-white text-[#22332d] text-[14px] font-semibold hover:bg-[#f4f8f5] transition-all flex items-center gap-1.5"
            >
              <span>Next exercise</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-full text-[#5b6b64] text-[14px] font-medium hover:text-[#22332d] ml-auto"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

