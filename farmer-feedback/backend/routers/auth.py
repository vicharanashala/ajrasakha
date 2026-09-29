import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt
import hashlib
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# Simple JWT-based auth
JWT_SECRET = os.getenv("JWT_SECRET", "ajrasakha_admin_secret_change_in_production_2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Admin credentials (in production, use proper password hashing + DB)
ADMIN_EMAIL = "suvanjanipad@gmail.com"
ADMIN_PASSWORD = "admin123"

security = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = JWT_EXPIRATION_HOURS * 3600
    user: dict


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


def create_access_token(email: str) -> str:
    payload = {
        "sub": email,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        "role": "admin"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """Dependency to get current admin user from JWT token"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    return payload


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    """Admin login endpoint"""
    if request.email.lower() != ADMIN_EMAIL.lower():
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if request.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(request.email)

    return TokenResponse(
        access_token=token,
        user={
            "email": ADMIN_EMAIL,
            "role": "admin",
            "name": "Admin"
        }
    )


@router.get("/me")
def get_me(admin: dict = Depends(get_current_admin)):
    """Get current authenticated admin info"""
    return {
        "email": admin.get("sub"),
        "role": admin.get("role"),
        "expires_at": admin.get("exp")
    }


@router.post("/logout")
def logout(admin: dict = Depends(get_current_admin)):
    """Logout endpoint (token removal is client-side)"""
    return {"message": "Logged out successfully", "email": admin.get("sub")}
