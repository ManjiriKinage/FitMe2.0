"""Supabase client and authentication dependencies."""
from fastapi import Header, HTTPException, status, Depends
from supabase import create_client, Client
from typing import Optional, Dict, Any
from app.core.config import settings

_supabase_anon: Optional[Client] = None
_supabase_admin: Optional[Client] = None

def get_supabase_anon_client() -> Optional[Client]:
    global _supabase_anon
    if _supabase_anon is None and settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
        _supabase_anon = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return _supabase_anon

def get_supabase_admin_client() -> Optional[Client]:
    global _supabase_admin
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
    if _supabase_admin is None and settings.SUPABASE_URL and key:
        _supabase_admin = create_client(settings.SUPABASE_URL, key)
    return _supabase_admin

async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Validates the Supabase Bearer token from the Authorization header.
    Returns the authenticated user dict: {'id': ..., 'email': ...}
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Must be 'Bearer <token>'."
        )

    token = authorization.split("Bearer ", 1)[1].strip()
    client = get_supabase_anon_client() or get_supabase_admin_client()

    if not client:
        # If running in local dev / mock test mode without credentials configured yet:
        if settings.ENVIRONMENT == "test":
            return {"id": "test-user-id", "email": "test@fitme.com"}
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase is not configured on the backend. Please set SUPABASE_URL and SUPABASE_ANON_KEY."
        )

    try:
        user_response = client.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token."
            )
        return {
            "id": user_response.user.id,
            "email": user_response.user.email,
            "app_metadata": user_response.user.app_metadata,
            "user_metadata": user_response.user.user_metadata,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
