import hashlib
import hmac
import threading
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

import argon2
import bcrypt
import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    STORAGE_ENCRYPTION_KEY,
)
from backend.app.database import get_db

# Configure Argon2id Password Hasher (RFC 9106 recommended profile)
_argon2_hasher = argon2.PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64 MB
    parallelism=1,
    hash_len=32,
    type=argon2.Type.ID,
)

# In-memory sliding window rate limiter for login attempts
_rate_limit_lock = threading.Lock()
_login_attempts: dict[str, list[float]] = defaultdict(list)


def check_login_rate_limit(
    identifier: str, max_attempts: int = 5, window_seconds: int = 60
) -> tuple[bool, int]:
    """
    Checks if an IP or username has exceeded the allowed login failure attempts within the sliding window.
    Returns: (is_rate_limited: bool, retry_after_seconds: int)
    """
    import time

    now = time.time()
    with _rate_limit_lock:
        attempts = [
            ts for ts in _login_attempts[identifier] if now - ts < window_seconds
        ]
        _login_attempts[identifier] = attempts
        if len(attempts) >= max_attempts:
            oldest = attempts[0]
            retry_after = max(1, int(window_seconds - (now - oldest)))
            return True, retry_after
        return False, 0


def record_login_attempt(identifier: str) -> None:
    """Records a failed authentication attempt."""
    import time

    with _rate_limit_lock:
        _login_attempts[identifier].append(time.time())


def clear_login_attempts(identifier: str) -> None:
    """Clears failed attempts upon successful authentication."""
    with _rate_limit_lock:
        _login_attempts.pop(identifier, None)


def hash_password(password: str) -> str:
    """
    Hashes a plaintext password using Argon2id with cryptographically secure salt.
    Fallback to bcrypt if argon2 raises an unexpected error.
    """
    try:
        return _argon2_hasher.hash(password)
    except Exception:
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Safely verifies a password against Argon2id or legacy bcrypt hash in constant time.
    """
    if not hashed_password or not plain_password:
        return False
    try:
        if hashed_password.startswith("$argon2"):
            return _argon2_hasher.verify(hashed_password, plain_password)
        elif hashed_password.startswith(("$2b$", "$2a$", "$2y$")):
            return bcrypt.checkpw(
                plain_password.encode("utf-8"), hashed_password.encode("utf-8")
            )
        else:
            return False
    except argon2.exceptions.VerifyMismatchError:
        return False
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Creates a signed JWT with unique jti, expiration, and user claims."""
    to_encode = data.copy()
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    jti = str(uuid.uuid4())
    if "sub" in to_encode and to_encode["sub"] is not None:
        to_encode["sub"] = str(to_encode["sub"])
    to_encode.update(
        {
            "exp": expire,
            "iat": now,
            "nbf": now,
            "jti": jti,
        }
    )
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decodes and validates JWT signature, algorithm, and expiration.
    Checks jti against token revocation list.
    """
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "iat", "jti", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired.")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {e!s}")

    # Immediate revocation check: check if jti is marked revoked
    jti = payload.get("jti")
    if jti:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM revoked_tokens WHERE jti = ?", (jti,))
            if cursor.fetchone():
                raise ValueError("Token has been revoked.")

    return payload


def revoke_token(token: str) -> None:
    """Immediately invalidates a JWT by adding its jti to the revoked_tokens store."""
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={
                "verify_exp": False
            },  # Still allow revoking expired/expiring tokens
        )
        jti = payload.get("jti")
        exp_ts = payload.get("exp")
        if not jti:
            return

        exp_iso = (
            datetime.fromtimestamp(exp_ts, tz=UTC).isoformat()
            if exp_ts
            else datetime.now(UTC).isoformat()
        )
        now_iso = datetime.now(UTC).isoformat()

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT OR IGNORE INTO revoked_tokens (jti, revoked_at, expires_at)
                VALUES (?, ?, ?)
            """,
                (jti, now_iso, exp_iso),
            )
    except Exception:
        pass


# ==============================================================================
# At-Rest Vault Storage Encryption (AES-256-GCM)
# ==============================================================================


def encrypt_vault_payload(plaintext_bytes: bytes) -> bytes:
    """
    Encrypts a file payload using AES-256-GCM.
    Returns nonce (12 bytes) + ciphertext_with_tag.
    """
    aesgcm = AESGCM(STORAGE_ENCRYPTION_KEY)
    import os

    nonce = os.urandom(
        12
    )  # 12-byte (96-bit) standard cryptographic random nonce for AES-GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, None)
    return nonce + ciphertext


def decrypt_vault_payload(encrypted_blob: bytes) -> bytes:
    """
    Decrypts an AES-256-GCM encrypted vault blob.
    Extracts 12-byte nonce and verifies GCM authentication tag.
    Raises ValueError if corrupted or tampered.
    """
    if len(encrypted_blob) < 28:  # 12-byte nonce + 16-byte tag minimum
        raise ValueError("Corrupted vault payload: insufficient length.")

    nonce = encrypted_blob[:12]
    ciphertext_with_tag = encrypted_blob[12:]
    aesgcm = AESGCM(STORAGE_ENCRYPTION_KEY)
    try:
        return aesgcm.decrypt(nonce, ciphertext_with_tag, None)
    except Exception as e:
        raise ValueError(
            f"Vault payload integrity check failed (tampering detected): {e!s}"
        )


def compute_sha256(data: bytes) -> str:
    """Computes SHA-256 hex digest for data integrity verification."""
    return hashlib.sha256(data).hexdigest()


def secure_compare(val1: str, val2: str) -> bool:
    """Timing-attack resilient string comparison."""
    return hmac.compare_digest(val1.encode("utf-8"), val2.encode("utf-8"))
