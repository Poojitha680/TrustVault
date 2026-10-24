import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = BASE_DIR / "vault_storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_PATH = BASE_DIR / "trustvault.db"

# Security & Cryptography Configuration
# In production, these should be supplied via KMS or secure environment variables.
# We supply deterministic defaults for local evaluation/testing with override support.
SECRET_KEY = os.getenv(
    "TRUSTVAULT_JWT_SECRET", "trustvault-jwt-sec-2026-hyper-secure-signature-key-512b"
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))

# Tamper-Evident Audit HMAC Key (separate from JWT secret to maintain separation of cryptographic domains)
AUDIT_HMAC_KEY = os.getenv(
    "TRUSTVAULT_AUDIT_HMAC_KEY", "trustvault-audit-tamper-evident-chain-key-2026"
).encode("utf-8")

# Storage At Rest Master Key (32 bytes for AES-256-GCM)
# Must be exactly 32 bytes
RAW_STORAGE_KEY = os.getenv("TRUSTVAULT_STORAGE_KEY", "TrustVaultAES256GCMAtRestKey32B")
if len(RAW_STORAGE_KEY) < 32:
    STORAGE_ENCRYPTION_KEY = RAW_STORAGE_KEY.ljust(32, "0").encode("utf-8")[:32]
else:
    STORAGE_ENCRYPTION_KEY = RAW_STORAGE_KEY[:32].encode("utf-8")

# Upload Limits & Rules
MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_MIME_TYPES = {
    "application/pdf": [b"%PDF"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "text/plain": [],  # Validated via UTF-8 / ASCII heuristics
    "text/csv": [],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
        b"PK\x03\x04"
    ],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        b"PK\x03\x04"
    ],
}
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".txt", ".csv", ".docx", ".xlsx"}
FORBIDDEN_EXTENSIONS = {
    ".exe",
    ".bat",
    ".cmd",
    ".sh",
    ".py",
    ".js",
    ".vbs",
    ".ps1",
    ".msi",
    ".dll",
    ".scr",
    ".pif",
    ".htm",
    ".html",
    ".svg",
    ".php",
    ".asp",
    ".aspx",
    ".jsp",
    ".jar",
    ".com",
    ".cpl",
    ".reg",
}
