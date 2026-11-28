"""Firebase Auth helpers.

Uses the Firebase Auth emulator's Identity Toolkit REST API to create
accounts and mint real ID tokens. The backend (firebase-admin with
FIREBASE_AUTH_EMULATOR_HOST set) verifies these tokens exactly like
production tokens, so the full auth middleware path is exercised.
"""
import requests

from . import config

_SIGNUP = f"{config.EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key={config.FIREBASE_API_KEY}"
_SIGNIN = f"{config.EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={config.FIREBASE_API_KEY}"


class AuthError(RuntimeError):
    pass


def sign_up(email: str, password: str = config.SEED_PASSWORD, session: requests.Session | None = None) -> dict:
    """Create an emulator account. Returns {localId, idToken, email}."""
    s = session or requests
    r = s.post(_SIGNUP, json={"email": email, "password": password, "returnSecureToken": True}, timeout=30)
    data = r.json()
    if r.status_code != 200:
        if data.get("error", {}).get("message", "").startswith("EMAIL_EXISTS"):
            return sign_in(email, password, session=session)
        raise AuthError(f"signUp failed for {email}: {data}")
    return data


def sign_in(email: str, password: str = config.SEED_PASSWORD, session: requests.Session | None = None) -> dict:
    """Password sign-in — this IS the 'login' operation measured in the login
    scenario. Returns {localId, idToken, email}."""
    s = session or requests
    r = s.post(_SIGNIN, json={"email": email, "password": password, "returnSecureToken": True}, timeout=30)
    data = r.json()
    if r.status_code != 200:
        raise AuthError(f"signIn failed for {email}: {data}")
    return data


def bearer(id_token: str) -> dict:
    return {"Authorization": f"Bearer {id_token}"}
