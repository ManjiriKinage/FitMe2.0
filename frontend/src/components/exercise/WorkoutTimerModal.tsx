"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { WorkoutPlanItem, caloriesBurned } from "@/lib/exercise";
import { api } from "@/lib/api";
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  X,
  ChevronRight,
  Flame,
  Clock,
  Dumbbell
} from "lucide-react";

interface WorkoutTimerModalProps {
  planItems: WorkoutPlanItem[];
  userWeightKg: number;
  initialItemIndex?: number;
  onClose: () => void;
  onFinishAndLog: (result: {
    name: string;
    completedSeconds: number;
    caloriesBurned: number;
    status: "completed" | "partial";
  }) => void;
}

export default function WorkoutTimerModal({
  planItems,
  userWeightKg,
  initialItemIndex = 0,
  onClose,
  onFinishAndLog,
}: WorkoutTimerModalProps) {
  const [currentIdx, setCurrentIdx] = useState(initialItemIndex);
  const [currentSet, setCurrentSet] = useState(1);
  const [isResting, setIsResting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentMove = planItems[currentIdx] || planItems[0];
  const totalSets = currentMove?.sets || 3;
  const restDurationSec = 30; // 30 sec standard rest between sets

  // Wall-clock resilient time tracking
  const startedAtRef = useRef<number>(Date.now());
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);

  const [totalElapsedSec, setTotalElapsedSec] = useState(0);
  const [moveElapsedSec, setMoveElapsedSec] = useState(0);
  const [restRemainingSec, setRestRemainingSec] = useState(restDurationSec);

  // Planned duration in seconds
  const totalPlannedSec = planItems.reduce((acc, it) => acc + it.durationMinutes * 60, 0);

  // Play audio/vibration notification
  const playAlertCue = useCallback(() => {
    if (!soundEnabled) return;

    // Vibration
    try {
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {}

    // Web Audio Synthesizer Beep
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch {}
  }, [soundEnabled]);

  // Screen Wake Lock API
  useEffect(() => {
    let released = false;
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator && !isPaused && !isCompleted) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch {
        // WakeLock unsupported or rejected, gracefully continue
      }
    }
    requestWakeLock();

    return () => {
      released = true;
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isPaused, isCompleted]);

  // Main high-precision timer loop using wall-clock diff
  useEffect(() => {
    if (isPaused || isCompleted) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const actualElapsedMs = now - startedAtRef.current - totalPausedMsRef.current;
      const totalSec = Math.floor(Math.max(0, actualElapsedMs) / 1000);
      setTotalElapsedSec(totalSec);

      if (isResting) {
        setRestRemainingSec((prev) => {
          if (prev <= 1) {
            playAlertCue();
            setIsResting(false);
            return restDurationSec;
          }
          return prev - 1;
        });
      } else {
        setMoveElapsedSec((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, isCompleted, isResting, playAlertCue, restDurationSec]);

  // Pause / Resume handler
  const handleTogglePause = () => {
    if (isPaused) {
      // Resuming
      if (pausedAtRef.current) {
        totalPausedMsRef.current += Date.now() - pausedAtRef.current;
        pausedAtRef.current = null;
      }
      setIsPaused(false);
    } else {
      // Pausing
      pausedAtRef.current = Date.now();
      setIsPaused(true);
    }
  };

  // Calories burned so far (accumulated proportionally across movements)
  // Average MET ~ 4.2
  const currentBurnedKcal = Math.round(
    caloriesBurned(4.2, userWeightKg || 70, totalElapsedSec)
  );

  // Set progression
  const handleNextSet = () => {
    playAlertCue();
    if (currentSet < totalSets) {
      setCurrentSet((s) => s + 1);
      setIsResting(true);
      setRestRemainingSec(restDurationSec);
    } else {
      handleNextMove();
    }
  };

  // Exercise progression
  const handleNextMove = () => {
    playAlertCue();
    if (currentIdx < planItems.length - 1) {
      setCurrentIdx((i) => i + 1);
      setCurrentSet(1);
      setIsResting(false);
      setMoveElapsedSec(0);
    } else {
      setIsCompleted(true);
    }
  };

  // Finish and Log Handler
  const handleFinishAndSave = async (isEarly: boolean = false) => {
    setIsSaving(true);
    const finalSeconds = Math.max(1, totalElapsedSec);
    const finalBurned = currentBurnedKcal;
    const workoutStatus = isEarly ? "partial" : "completed";
    const workoutName = planItems.map((p) => p.name).slice(0, 3).join(", ") + (planItems.length > 3 ? "..." : "");

    try {
      await api.logExerciseSession({
        name: workoutName,
        completed_seconds: finalSeconds,
        calories_burned: finalBurned,
        met: 4.2,
        weight_kg_used: userWeightKg,
        status: workoutStatus,
        planned_seconds: totalPlannedSec,
      });

      onFinishAndLog({
        name: workoutName,
        completedSeconds: finalSeconds,
        caloriesBurned: finalBurned,
        status: workoutStatus,
      });
    } catch (err) {
      console.error("Failed to log workout session:", err);
      // Still forward to user callback so session isn't lost
      onFinishAndLog({
        name: workoutName,
        completedSeconds: finalSeconds,
        caloriesBurned: finalBurned,
        status: workoutStatus,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Format seconds as MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // SVG Progress Ring
  const radius = 96;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = totalPlannedSec > 0 ? Math.min(1, totalElapsedSec / totalPlannedSec) : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Workout Active Timer"
    >
      <div className="relative w-full max-w-[500px] bg-white rounded-[28px] p-6 shadow-2xl flex flex-col items-center gap-6 overflow-hidden">
        {/* Top Control Bar */}
        <div className="w-full flex justify-between items-center pb-2 border-b border-[#eef1ee]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#7c9a7e] animate-pulse" />
            <span className="text-[13px] font-bold uppercase tracking-wider text-[#22332d]">
              {isCompleted ? "Workout Complete" : isResting ? "Rest Period" : "Active Workout"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio/Vibe Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className={`p-2 rounded-full border text-xs flex items-center gap-1.5 transition-colors ${
                soundEnabled
                  ? "bg-[#eaf1ec] border-[#7c9a7e] text-[#22332d]"
                  : "border-[#dfe6e1] text-[#5b6b64] hover:bg-[#f4f8f5]"
              }`}
              title={soundEnabled ? "Sound and vibration cues ON" : "Sound and vibration cues OFF"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Exit Button */}
            <button
              type="button"
              onClick={() => setShowExitConfirm(true)}
              className="p-1.5 text-[#5b6b64] hover:text-[#22332d] rounded-full hover:bg-[#f4f8f5] transition-colors"
              aria-label="Exit workout"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Completion View */}
        {isCompleted ? (
          <div className="flex flex-col items-center text-center py-4 w-full">
            <div className="w-20 h-20 rounded-full bg-[#eaf1ec] text-[#22332d] flex items-center justify-center mb-4 shadow-sm">
              <CheckCircle2 className="w-10 h-10 text-[#7c9a7e]" />
            </div>
            <h3 className="text-[24px] font-bold text-[#22332d]">Great Job!</h3>
            <p className="text-[14px] text-[#5b6b64] mt-1 max-w-[320px]">
              You completed all exercises in your scheduled workout plan.
            </p>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 gap-3 w-full my-6">
              <div className="bg-[#f4f8f5] rounded-[18px] p-4 text-center border border-[#eaf1ec]">
                <Clock className="w-5 h-5 text-[#7c9a7e] mx-auto mb-1" />
                <div className="text-[22px] font-bold text-[#22332d]">
                  {formatTime(totalElapsedSec)}
                </div>
                <div className="text-[12px] text-[#5b6b64] font-medium">Total Time</div>
              </div>
              <div className="bg-[#f4f8f5] rounded-[18px] p-4 text-center border border-[#eaf1ec]">
                <Flame className="w-5 h-5 text-[#e57373] mx-auto mb-1" />
                <div className="text-[22px] font-bold text-[#22332d]">
                  {currentBurnedKcal} kcal
                </div>
                <div className="text-[12px] text-[#5b6b64] font-medium">Burned</div>
              </div>
            </div>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleFinishAndSave(false)}
              className="w-full h-12 rounded-full bg-[#22332d] text-white text-[15px] font-semibold hover:bg-[#1a2823] transition-all shadow-md"
            >
              {isSaving ? "Saving session..." : "Finish & log workout"}
            </button>
          </div>
        ) : (
          /* Active Workout Screen */
          <>
            {/* SVG Progress Countdown Ring */}
            <div className="relative w-[230px] h-[230px] flex items-center justify-center my-1">
              <svg width="230" height="230" className="transform -rotate-90" aria-hidden="true">
                {/* Background Track */}
                <circle
                  cx="115"
                  cy="115"
                  r={radius}
                  fill="none"
                  stroke="#eaf1ec"
                  strokeWidth="14"
                />
                {/* Active Progress Ring */}
                <circle
                  cx="115"
                  cy="115"
                  r={radius}
                  fill="none"
                  stroke={isResting ? "#f59e0b" : "#7c9a7e"}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500 ease-out"
                />
              </svg>

              {/* Center Elapsed Counter */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-[13px] font-medium text-[#5b6b64]">
                  {isResting ? "Resting" : "Elapsed"}
                </span>
                <span className="text-[40px] font-extrabold text-[#22332d] leading-none my-1 tracking-tight">
                  {isResting ? `${restRemainingSec}s` : formatTime(totalElapsedSec)}
                </span>
                <div className="flex items-center gap-1 text-[13px] font-bold text-[#7c9a7e]">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  <span>{currentBurnedKcal} kcal</span>
                </div>
              </div>
            </div>

            {/* Current Exercise Context */}
            <div className="w-full bg-[#f4f8f5] rounded-[18px] p-4 text-center border border-[#eaf1ec] flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[#5b6b64] uppercase tracking-wider">
                Move {currentIdx + 1} of {planItems.length}
              </span>
              <h4 className="text-[18px] font-bold text-[#22332d] m-0">
                {currentMove.name}
              </h4>
              <p className="text-[13px] text-[#5b6b64] m-0">
                Set {currentSet} of {totalSets} · {currentMove.description}
              </p>
            </div>

            {/* Timer Actions Bar */}
            <div className="w-full flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleTogglePause}
                className="flex-1 h-12 rounded-full border border-[#dfe6e1] bg-white text-[#22332d] text-[14px] font-bold hover:bg-[#f4f8f5] transition-all flex items-center justify-center gap-2"
              >
                {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
                <span>{isPaused ? "Resume" : "Pause"}</span>
              </button>

              <button
                type="button"
                onClick={handleNextSet}
                className="flex-1 h-12 rounded-full bg-[#7c9a7e] text-white text-[14px] font-bold hover:bg-[#68856a] transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>{currentSet < totalSets ? "Next set" : "Next move"}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Finish & Log Link */}
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleFinishAndSave(true)}
              className="text-[13px] text-[#5b6b64] hover:text-[#22332d] font-semibold underline transition-colors"
            >
              {isSaving ? "Saving..." : "Finish early & log"}
            </button>
          </>
        )}

        {/* Exit Confirmation Dialog */}
        {showExitConfirm && (
          <div className="absolute inset-0 bg-white/95 rounded-[28px] p-6 flex flex-col items-center justify-center text-center z-10">
            <AlertCircle className="w-12 h-12 text-[#e57373] mb-3" />
            <h4 className="text-[18px] font-bold text-[#22332d]">Workout In Progress</h4>
            <p className="text-[13px] text-[#5b6b64] mt-2 max-w-[280px]">
              Are you sure you want to exit? Your progress won't be saved unless you click Finish &amp; log.
            </p>
            <div className="flex gap-3 w-full mt-6">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 h-11 rounded-full border border-[#dfe6e1] text-[#22332d] font-semibold text-[14px]"
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-full bg-red-600 text-white font-semibold text-[14px] hover:bg-red-700"
              >
                Exit without saving
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
