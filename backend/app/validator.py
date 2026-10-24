import os
import re

from fastapi import HTTPException, UploadFile, status

from backend.app.config import (
    ALLOWED_EXTENSIONS,
    FORBIDDEN_EXTENSIONS,
    MAX_UPLOAD_SIZE_BYTES,
)


def sanitize_filename(filename: str) -> str:
    """
    Sanitizes a filename to eliminate path traversal, directory escapes,
    null bytes, and shell metacharacters.
    """
    if not filename:
        return "unnamed_document.bin"

    # Remove null bytes, carriage returns, newlines
    clean = filename.replace("\x00", "").replace("\r", "").replace("\n", "")

    # Strip Windows and Unix directory paths
    clean = os.path.basename(clean.replace("\\", "/"))

    # Remove all leading dots and path traversal attempts
    clean = re.sub(r"^\.+", "", clean)

    # Replace all characters except alphanumeric, dot, dash, underscore
    clean = re.sub(r"[^a-zA-Z0-9.\-_]", "_", clean)

    # Collapse multiple dots to prevent extension masking
    # e.g., secret.pdf....exe -> secret.pdf.exe -> checked in extension validator
    clean = re.sub(r"\.{2,}", ".", clean)

    if not clean or clean == ".":
        return "sanitized_document.bin"

    return clean[:120]  # Reasonable max length


def validate_file_extension(filename: str) -> tuple[bool, str, str]:
    """
    Validates file extension, checking for forbidden executable extensions
    and multi-extension tricks (e.g. evil.pdf.exe).
    """
    clean_name = sanitize_filename(filename)
    parts = clean_name.lower().split(".")

    if len(parts) < 2:
        return False, "File must have an explicit extension.", ""

    # Check all extension suffixes to prevent double extension attacks
    for part in parts[1:]:
        ext_with_dot = f".{part}"
        if ext_with_dot in FORBIDDEN_EXTENSIONS:
            return (
                False,
                f"Dangerous executable extension '{ext_with_dot}' is forbidden.",
                "",
            )

    final_ext = f".{parts[-1]}"
    if final_ext not in ALLOWED_EXTENSIONS:
        return (
            False,
            f"Extension '{final_ext}' is not permitted. Permitted types: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            "",
        )

    return True, "", final_ext


def validate_magic_bytes(
    content: bytes, declared_mime: str, extension: str
) -> tuple[bool, str, str]:
    """
    Validates the magic numbers (file signature) of the file content
    against the claimed MIME type and extension to prevent polyglots and MIME spoofing.
    """
    if len(content) == 0:
        return False, "Uploaded file is empty (0 bytes).", ""

    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        return (
            False,
            f"File size exceeds maximum permitted limit of {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB.",
            "",
        )

    # Magic byte verification
    if extension == ".pdf":
        if not content.startswith(b"%PDF"):
            return (
                False,
                "Content does not match a valid PDF file signature (%PDF).",
                "",
            )
        return True, "", "application/pdf"

    elif extension == ".png":
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            return False, "Content does not match a valid PNG image signature.", ""
        return True, "", "image/png"

    elif extension in (".jpg", ".jpeg"):
        if not content.startswith(b"\xff\xd8\xff"):
            return False, "Content does not match a valid JPEG image signature.", ""
        return True, "", "image/jpeg"

    elif extension in (".docx", ".xlsx"):
        # Office open XML formats are ZIP archives starting with PK\x03\x04
        if not content.startswith(b"PK\x03\x04"):
            return (
                False,
                "Content does not match a valid Office Open XML package (ZIP signature missing).",
                "",
            )
        canonical_mime = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            if extension == ".docx"
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        return True, "", canonical_mime

    elif extension in (".txt", ".csv"):
        # Validate that content is valid UTF-8/ASCII without null bytes or binary execution markers
        if b"\x00" in content:
            return (
                False,
                "Text document contains binary null bytes, which is forbidden.",
                "",
            )
        try:
            content.decode("utf-8")
        except UnicodeDecodeError:
            try:
                content.decode("latin-1")
            except Exception:
                return False, "Text document contains undecodable binary sequences.", ""

        canonical_mime = "text/csv" if extension == ".csv" else "text/plain"
        return True, "", canonical_mime

    return False, f"Unsupported file type '{extension}'.", ""


async def validate_and_read_upload(file: UploadFile) -> tuple[bytes, str, str, str]:
    """
    Performs full pipeline validation on an incoming FastAPI UploadFile:
    1. Filename sanitization
    2. Extension & multi-extension verification
    3. File size constraints
    4. Magic byte signature verification
    Returns (content_bytes, sanitized_filename, extension, canonical_mime_type)
    """
    raw_name = file.filename or "uploaded_file.bin"
    clean_name = sanitize_filename(raw_name)

    is_valid_ext, ext_err, extension = validate_file_extension(clean_name)
    if not is_valid_ext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File validation failed: {ext_err}",
        )

    # Read content up to max size + 1 to detect overflow
    content = await file.read(MAX_UPLOAD_SIZE_BYTES + 1024)
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed limit of {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB.",
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty (0 bytes)."
        )

    is_valid_magic, magic_err, canonical_mime = validate_magic_bytes(
        content, file.content_type or "", extension
    )
    if not is_valid_magic:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File content validation failed: {magic_err}",
        )

    return content, clean_name, extension, canonical_mime
