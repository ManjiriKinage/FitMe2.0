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

def is_service_role_key(key: str) -> bool:
    try:
        import base64, json
        parts = key.split(".")
        if len(parts) >= 2:
            payload = parts[1] + "=" * (-len(parts[1]) % 4)
            data = json.loads(base64.b64decode(payload))
            return data.get("role") == "service_role"
    except Exception:
        pass
    return False

def get_supabase_admin_client(user: Optional[Dict[str, Any]] = None) -> Optional[Client]:
    """
    Returns an admin client if a real service_role key is present.
    If only the anon key is available, returns a client authenticated with the user's JWT
    so that PostgreSQL Row Level Security (RLS) policies pass.
    """
    global _supabase_admin
    if settings.SUPABASE_SERVICE_ROLE_KEY and is_service_role_key(settings.SUPABASE_SERVICE_ROLE_KEY):
        if _supabase_admin is None and settings.SUPABASE_URL:
            _supabase_admin = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        return _supabase_admin

    # Fallback to anon client scoped with user's JWT token
    token = user.get("token") if isinstance(user, dict) else None
    if settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        if token:
            client.postgrest.auth(token)
        return client
    return None

def get_user_db_client(user: Optional[Dict[str, Any]] = None) -> Client:
    """Convenience alias for get_supabase_admin_client(user)."""
    client = get_supabase_admin_client(user)
    if not client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database client could not be initialized."
        )
    return client

async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Validates the Supabase Bearer token from the Authorization header.
    Returns the authenticated user dict: {'id': ..., 'email': ..., 'token': ...}
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Must be 'Bearer <token>'."
        )

    token = authorization.split("Bearer ", 1)[1].strip()
    client = get_supabase_anon_client()

    if not client:
        # If running in local dev / mock test mode without credentials configured yet:
        if settings.ENVIRONMENT == "test":
            return {"id": "test-user-id", "email": "test@fitme.com", "token": "test-token"}
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
            "token": token,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
