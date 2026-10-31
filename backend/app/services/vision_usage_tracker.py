"""Vision API usage tracking, token accounting, and cache management service."""
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from app.schemas.meal_scan import VisionUsageStatsResponse

logger = logging.getLogger(__name__)

# Typical token costs per Gemini Vision multimodal call
ESTIMATED_PROMPT_TOKENS_PER_IMAGE = 320
ESTIMATED_COMPLETION_TOKENS_PER_SCAN = 160


class VisionUsageTracker:
    """
    Tracks Vision API usage, token consumption, cache hits, and estimated token savings.
    Enforces user isolation: all statistics and cache keys are strictly scoped per user_id.
    """
    _lock = threading.Lock()
    _user_stats: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def reset(cls) -> None:
        """Resets in-memory stats (useful for testing)."""
        with cls._lock:
            cls._user_stats.clear()

    @classmethod
    def record_scan(
        cls,
        user_id: str,
        image_hash: str,
        is_cache_hit: bool,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        latency_ms: float = 0.0,
        model_version: str = "gemini-flash-lite-latest",
        client: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Records a plate scan analysis event.
        Calculates tokens consumed or tokens saved when served from cache.
        """
        now = datetime.now(timezone.utc)
        with cls._lock:
            if user_id not in cls._user_stats:
                cls._user_stats[user_id] = {
                    "total_scans": 0,
                    "cache_hits": 0,
                    "cache_misses": 0,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "tokens_saved": 0,
                    "calls_saved": 0,
                    "last_scan_at": now
                }

            stats = cls._user_stats[user_id]
            stats["total_scans"] += 1
            stats["last_scan_at"] = now

            if is_cache_hit:
                stats["cache_hits"] += 1
                stats["calls_saved"] += 1
                # Estimate tokens saved by avoiding remote vision model invocation
                saved_tokens = prompt_tokens or (ESTIMATED_PROMPT_TOKENS_PER_IMAGE + ESTIMATED_COMPLETION_TOKENS_PER_SCAN)
                stats["tokens_saved"] += saved_tokens
                token_record = {
                    "is_cache_hit": True,
                    "tokens_consumed": 0,
                    "tokens_saved": saved_tokens,
                    "calls_saved": 1,
                    "latency_ms": latency_ms,
                    "model_version": model_version
                }
            else:
                stats["cache_misses"] += 1
                act_prompt = prompt_tokens if prompt_tokens > 0 else ESTIMATED_PROMPT_TOKENS_PER_IMAGE
                act_comp = completion_tokens if completion_tokens > 0 else ESTIMATED_COMPLETION_TOKENS_PER_SCAN
                stats["prompt_tokens"] += act_prompt
                stats["completion_tokens"] += act_comp
                token_record = {
                    "is_cache_hit": False,
                    "prompt_tokens": act_prompt,
                    "completion_tokens": act_comp,
                    "total_tokens": act_prompt + act_comp,
                    "tokens_saved": 0,
                    "latency_ms": latency_ms,
                    "model_version": model_version
                }

        return token_record

    @classmethod
    def get_user_stats(
        cls,
        user_id: str,
        client: Optional[Any] = None
    ) -> VisionUsageStatsResponse:
        """
        Returns API usage and token accounting stats for the authenticated user.
        Combines memory metrics and database food_images history if available.
        """
        with cls._lock:
            mem = cls._user_stats.get(user_id, {
                "total_scans": 0,
                "cache_hits": 0,
                "cache_misses": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "tokens_saved": 0,
                "calls_saved": 0,
                "last_scan_at": None
            })

            total = mem["total_scans"]
            hits = mem["cache_hits"]
            misses = mem["cache_misses"]
            p_tok = mem["prompt_tokens"]
            c_tok = mem["completion_tokens"]
            saved_tok = mem["tokens_saved"]
            saved_calls = mem["calls_saved"]
            last_dt = mem.get("last_scan_at")

        # Supplement with DB records if in-memory is empty
        if total == 0 and client:
            try:
                res = (
                    client.table("food_images")
                    .select("id, token_usage_json, created_at")
                    .eq("user_id", user_id)
                    .execute()
                )
                if res.data:
                    total = len(res.data)
                    misses = total
                    p_tok = total * ESTIMATED_PROMPT_TOKENS_PER_IMAGE
                    c_tok = total * ESTIMATED_COMPLETION_TOKENS_PER_SCAN
                    try:
                        last_dt = datetime.fromisoformat(res.data[-1]["created_at"].replace("Z", "+00:00"))
                    except Exception:
                        pass
            except Exception as e:
                logger.debug(f"DB usage stats query skipped: {e}")

        hit_rate = round((hits / total * 100.0), 1) if total > 0 else 0.0

        return VisionUsageStatsResponse(
            user_id=user_id,
            total_scans=total,
            cache_hits=hits,
            cache_misses=misses,
            cache_hit_rate_pct=hit_rate,
            total_prompt_tokens=p_tok,
            total_completion_tokens=c_tok,
            total_tokens_consumed=p_tok + c_tok,
            estimated_tokens_saved=saved_tok,
            estimated_calls_saved=saved_calls,
            last_scan_at=last_dt
        )

    @classmethod
    def invalidate_cache(
        cls,
        user_id: str,
        image_hash: Optional[str] = None,
        all_cached: bool = False,
        client: Optional[Any] = None
    ) -> int:
        """
        Invalidates cached food image analyses for the user.
        Guarantees user isolation: cannot invalidate another user's cache.
        """
        if not client or not user_id:
            return 0

        invalidated_count = 0
        try:
            query = client.table("food_images").update({
                "analysis_status": "invalidated",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("user_id", user_id)

            if not all_cached and image_hash:
                query = query.eq("image_hash", image_hash)

            res = query.execute()
            if res.data:
                invalidated_count = len(res.data)
                logger.info(f"Invalidated {invalidated_count} cache entries for user {user_id}")
        except Exception as exc:
            logger.warning(f"Failed to invalidate cache for user {user_id}: {exc}")

        return invalidated_count
