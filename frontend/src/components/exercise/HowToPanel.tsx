"use client";

import React, { useEffect, useRef, useState } from "react";
import { WorkoutPlanItem } from "@/lib/exercise";
import { Play, Pause, AlertTriangle, ShieldAlert, X, ChevronRight, VolumeX } from "lucide-react";

interface ExerciseMedia {
  type?: "video" | "image";
  url?: string;
  youtube_id?: string;
  poster_url?: string;
  author?: string;
  license_name?: string;
  license_url?: string;
  source_url?: string;
}

interface HowToPanelProps {
  item: WorkoutPlanItem;
  currentIndex: number;
  totalItems: number;
  media?: ExerciseMedia | null;
  onClose: () => void;
  onNext?: () => void;
  onStartSetTimer?: (item: WorkoutPlanItem) => void;
}

export default function HowToPanel({
  item,
  currentIndex,
  totalItems,
  media,
  onClose,
  onNext,
  onStartSetTimer,
}: HowToPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [loadYouTube, setLoadYouTube] = useState(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, []);

  // Pause video when offscreen using IntersectionObserver
  useEffect(() => {
    const video = videoRef.current;
    if (!video || prefersReducedMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch(() => {});
            setIsPlaying(true);
          } else {
            video.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [prefersReducedMotion, item.slug]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const hasVideoUrl = media?.type === "video" && media.url && !prefersReducedMotion;
  const hasYouTube = Boolean(media?.youtube_id);
  const posterUrl = media?.poster_url;

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 grid grid-cols-1 lg:grid-cols-[1fr_1.25fr] gap-7 items-start transition-all"
      aria-label={`How to do ${item.name}`}
    >
      {/* Left Column: Media / Animation Display */}
      <div className="flex flex-col gap-3">
        <div className="relative w-full h-[250px] sm:h-[280px] bg-[#2d4238] rounded-[24px] overflow-hidden flex flex-col items-center justify-center text-white select-none">
          {hasYouTube ? (
            loadYouTube ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${media?.youtube_id}?rel=0&modestbranding=1`}
                title={`${item.name} demonstration`}
                className="w-full h-full border-0"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                <button
                  type="button"
                  onClick={() => setLoadYouTube(true)}
                  className="w-16 h-16 rounded-full bg-[#7c9a7e] flex items-center justify-center hover:bg-[#68856a] transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label="Load video demo"
                >
                  <Play className="w-7 h-7 text-white fill-current ml-0.5" />
                </button>
                <b className="mt-3 text-[15px] font-bold">Watch Video Guide</b>
                <span className="text-[12px] text-[#b7cdb9] mt-1">Privacy-friendly YouTube embed</span>
              </div>
            )
          ) : hasVideoUrl ? (
            <>
              <video
                ref={videoRef}
                src={media.url}
                poster={posterUrl}
                muted
                loop
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
                aria-label={`${item.name} looping demonstration`}
              />
              <button
                type="button"
                onClick={togglePlayPause}
                className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
                aria-label={isPlaying ? "Pause video" : "Play video"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <div className="absolute top-3 left-3 bg-black/60 text-white px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 pointer-events-none">
                <VolumeX className="w-3.5 h-3.5" />
                <span>Muted loop</span>
              </div>
            </>
          ) : posterUrl || prefersReducedMotion ? (
            <img
              src={posterUrl || "/images/exercise-placeholder.svg"}
              alt={`Demonstration of ${item.name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            /* Clean Design Mockup Placeholder matching attached HTML */
            <div className="flex flex-col items-center justify-center text-center p-4">
              <div className="w-16 h-16 rounded-full bg-[#7c9a7e] flex items-center justify-center mb-2 shadow-sm">
                <Play className="w-7 h-7 text-white fill-current ml-0.5" aria-hidden="true" />
              </div>
              <b className="text-[16px] font-bold">Looping demo</b>
              <span className="text-[12px] text-[#b7cdb9] mt-1 font-medium">
                Short movement guide · 8 seconds
              </span>
            </div>
          )}
        </div>

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

        {/* Media Attribution & License */}
        <p className="text-[12px] text-[#5b6b64] leading-normal">
          {media?.author ? (
            <>
              Demo credit:{" "}
              {media.source_url ? (
                <a
                  href={media.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[#22332d]"
                >
                  {media.author}
                </a>
              ) : (
                <span>{media.author}</span>
              )}{" "}
              {media.license_name && (
                <>
                  (
                  {media.license_url ? (
                    <a
                      href={media.license_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-[#22332d]"
                    >
                      {media.license_name}
                    </a>
                  ) : (
                    media.license_name
                  )}
                  )
                </>
              )}
            </>
          ) : (
            <span>Movement guide and verified clinical safety cues.</span>
          )}
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
