"use client";

import React, { useState, useEffect } from "react";
import { Play, AlertCircle, Check, ExternalLink, VideoOff, Flag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

// YouTube IDs are strictly 11 characters of letters, digits, underscores, or hyphens
const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export interface ExerciseMediaRecord {
  id: string;
  exercise_id: string;
  type: string;
  youtube_id?: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
  channel_name?: string | null;
  license_note?: string | null;
  reviewed_on?: string | null;
  approved_by?: string | null;
  is_active: boolean;
  sort_order: number;
}

interface ExerciseVideoProps {
  exerciseId?: string;
  exerciseSlug?: string;
  exerciseName?: string;
}

export default function ExerciseVideo({
  exerciseId,
  exerciseSlug,
  exerciseName,
}: ExerciseVideoProps) {
  const [media, setMedia] = useState<ExerciseMediaRecord | null>(null);
  const [actualExerciseId, setActualExerciseId] = useState<string | undefined>(exerciseId);
  const [loading, setLoading] = useState<boolean>(true);
  const [imageError, setImageError] = useState<boolean>(false);
  const [hasTappedPlay, setHasTappedPlay] = useState<boolean>(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  // Problem reporting state
  const [isReporting, setIsReporting] = useState<boolean>(false);
  const [reportSubmitted, setReportSubmitted] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);

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

  // Fetch the first active media row (lowest sort_order)
  useEffect(() => {
    let isCancelled = false;

    async function loadActiveMedia() {
      setLoading(true);
      setImageError(false);
      setHasTappedPlay(false);
      setReportSubmitted(false);

      try {
        let resolvedExId = exerciseId;

        // If no exerciseId UUID provided, resolve by slug first
        if (!resolvedExId && exerciseSlug) {
          try {
            const { data: exRow } = await supabase
              .from("exercises")
              .select("id")
              .eq("slug", exerciseSlug)
              .maybeSingle();
            if (exRow?.id) {
              resolvedExId = exRow.id;
              if (!isCancelled) setActualExerciseId(resolvedExId);
            }
          } catch {
            // ignore
          }
        } else if (resolvedExId) {
          setActualExerciseId(resolvedExId);
        }

        // 1. Try Backend API first
        try {
          const res = await api.getExerciseMedia({
            exercise_id: resolvedExId,
            slug: exerciseSlug,
          });
          if (res?.media) {
            if (!isCancelled) {
              setMedia(res.media);
              setLoading(false);
            }
            return;
          }
        } catch {
          // Fall back to direct Supabase query
        }

        // 2. Direct Supabase Query fallback
        if (resolvedExId) {
          const { data: mediaRow } = await supabase
            .from("exercise_media")
            .select("*")
            .eq("exercise_id", resolvedExId)
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!isCancelled) {
            setMedia(mediaRow as ExerciseMediaRecord | null);
          }
        } else {
          if (!isCancelled) setMedia(null);
        }
      } catch (err) {
        console.warn("Could not load exercise video:", err);
        if (!isCancelled) setMedia(null);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadActiveMedia();

    return () => {
      isCancelled = true;
    };
  }, [exerciseId, exerciseSlug]);

  const rawYoutubeId = media?.youtube_id?.trim();
  const isValidYoutubeId = Boolean(rawYoutubeId && YOUTUBE_ID_REGEX.test(rawYoutubeId));

  // Handle reporting problem
  const handleReportProblem = async () => {
    if (!actualExerciseId || isReporting || reportSubmitted) return;
    setIsReporting(true);
    setReportError(null);

    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setReportError("Sign in required to report.");
        setIsReporting(false);
        return;
      }

      // Try API report
      try {
        await api.reportMediaProblem({
          exercise_id: actualExerciseId,
          media_id: media?.id,
        });
      } catch {
        // Fall back to direct insert
        await supabase.from("media_reports").insert({
          user_id: session.user.id,
          exercise_id: actualExerciseId,
          media_id: media?.id || null,
        });
      }

      setReportSubmitted(true);
    } catch (err: any) {
      setReportError("Failed to submit report.");
    } finally {
      setIsReporting(false);
    }
  };

  // Build Privacy-Enhanced Embed URL
  const buildEmbedUrl = () => {
    if (!rawYoutubeId) return "";
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
      autoplay: "1",
    });

    if (media?.start_seconds && media.start_seconds > 0) {
      params.set("start", String(media.start_seconds));
    }
    if (media?.end_seconds && media.end_seconds > 0) {
      params.set("end", String(media.end_seconds));
    }

    return `https://www.youtube-nocookie.com/embed/${rawYoutubeId}?${params.toString()}`;
  };

  // Poster Image URL using official YouTube static CDN
  const posterUrl = isValidYoutubeId
    ? `https://i.ytimg.com/vi/${rawYoutubeId}/hqdefault.jpg`
    : "";

  // Title for accessible iframe
  const videoTitle = exerciseName
    ? `${exerciseName} video demonstration`
    : "Exercise technique video demonstration";

  return (
    <div className="w-full flex flex-col gap-2">
      {/* 16:9 Reserved Height Container */}
      <div className="relative w-full aspect-video min-h-[200px] sm:min-h-[240px] rounded-[20px] bg-[#22332d] overflow-hidden shadow-sm flex items-center justify-center select-none border border-[#31453c]">
        {loading ? (
          // Reserved Skeleton while loading
          <div className="w-full h-full flex flex-col items-center justify-center text-[#b7cdb9]">
            <div className="w-12 h-12 rounded-full bg-white/10 animate-pulse flex items-center justify-center mb-2">
              <Play className="w-5 h-5 text-white/40 ml-0.5" />
            </div>
            <span className="text-xs text-[#b7cdb9]/70">Checking video demo...</span>
          </div>
        ) : !isValidYoutubeId || imageError ? (
          // Clean Placeholder when no active row exists, or ID is invalid (e.g. REPLACE_ME), or poster fails
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 text-white">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-2.5 text-[#b7cdb9]">
              <VideoOff className="w-6 h-6" aria-hidden="true" />
            </div>
            <p className="text-[15px] font-semibold text-white m-0">
              Video not available.
            </p>
            <p className="text-[13px] text-[#b7cdb9] m-0 mt-1">
              Follow the steps below.
            </p>
          </div>
        ) : hasTappedPlay ? (
          // Privacy-Enhanced YouTube Embed (Replaces poster only after user taps play)
          <iframe
            src={buildEmbedUrl()}
            title={videoTitle}
            className="w-full h-full border-0"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          // Poster Display with large Play button (Nothing loaded from YouTube iframe until tap)
          <div className="relative w-full h-full group">
            {/* Poster Image */}
            <img
              src={posterUrl}
              alt={videoTitle}
              loading="lazy"
              onError={() => setImageError(true)}
              className="w-full h-full object-cover filter brightness-[0.88] transition-transform duration-300 group-hover:scale-105"
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

            {/* Large Play Button */}
            <button
              type="button"
              onClick={() => setHasTappedPlay(true)}
              aria-label={`Play ${videoTitle}`}
              className="absolute inset-0 m-auto w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-[#7c9a7e] hover:bg-[#6c8b6e] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-white/40"
            >
              <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
            </button>

            {/* Privacy Badge */}
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-xs text-white/90 px-2.5 py-1 rounded-full text-[11px] font-medium pointer-events-none">
              Privacy-enhanced
            </div>
          </div>
        )}
      </div>

      {/* Attribution, Watch Link & Report link under player */}
      {isValidYoutubeId && !imageError && (
        <div className="flex items-center justify-between gap-3 px-1 text-[12px] text-[#5b6b64] flex-wrap">
          <div className="flex items-center gap-2">
            <span>Video: <b className="text-[#22332d] font-semibold">{media?.channel_name || "Demonstration"}</b></span>
            <span>·</span>
            <a
              href={`https://www.youtube.com/watch?v=${rawYoutubeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#22332d] hover:text-[#7c9a7e] font-medium underline underline-offset-2"
            >
              <span>Watch on YouTube</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>

          {/* Report a Problem Link */}
          <div className="flex items-center gap-1.5">
            {reportSubmitted ? (
              <span className="inline-flex items-center gap-1 text-[#2e7d32] font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Reported. Thank you!</span>
              </span>
            ) : (
              <button
                type="button"
                disabled={isReporting}
                onClick={handleReportProblem}
                className="inline-flex items-center gap-1 text-[#5b6b64] hover:text-red-700 transition-colors disabled:opacity-50 text-[11px]"
                title="Report a broken or inaccurate video"
              >
                <Flag className="w-3 h-3" />
                <span>{isReporting ? "Reporting..." : "Report a problem"}</span>
              </button>
            )}
            {reportError && (
              <span className="text-red-600 text-[11px] ml-1 flex items-center gap-0.5">
                <AlertCircle className="w-3 h-3" />
                {reportError}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

