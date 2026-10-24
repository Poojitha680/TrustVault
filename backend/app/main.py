from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import Response as RawResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

from backend.app.ai_assistant import generate_access_recommendations
from backend.app.audit import (
    get_audit_trail,
    record_audit_event,
    verify_audit_integrity,
)
from backend.app.authz import check_document_access
from backend.app.config import BASE_DIR
from backend.app.database import get_db, init_db
from backend.app.schemas import (
    AISuggestionResponse,
    AuditVerificationResult,
    DocumentResponse,
    DocumentUpdate,
    PermissionEntry,
    PermissionGrantRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from backend.app.security import (
    check_login_rate_limit,
    clear_login_attempts,
    compute_sha256,
    create_access_token,
    decode_access_token,
    hash_password,
    record_login_attempt,
    revoke_token,
    verify_password,
)
from backend.app.storage import VaultStorageManager
from backend.app.validator import validate_and_read_upload

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes schema on startup using the modern FastAPI lifespan pattern."""
    init_db()
    yield
    # Shutdown cleanup can go here if needed


app = FastAPI(
    title="TrustVault Security Engine",
    description="High-Assurance Confidential Document Platform with Cryptographic Audit Integrity",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security_bearer = HTTPBearer(auto_error=False)

# ==============================================================================
# Authentication & User Context Dependencies
# ==============================================================================


def get_client_ip(request: Request) -> str:
    """Extracts client IP address safely."""
    client = request.client
    return client.host if client else "127.0.0.1"


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_bearer),
) -> dict[str, Any]:
    """
    Extracts, verifies, and resolves the current authenticated user.
    Enforces active status and token revocation checks.
    """
    if not credentials:
        record_audit_event(
            action="UNAUTHENTICATED_ACCESS_ATTEMPT",
            status="REFUSED",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            details=f"Unauthenticated request to {request.url.path}",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided or are missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except ValueError as e:
        record_audit_event(
            action="INVALID_TOKEN_ATTEMPT",
            status="REFUSED",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            details=f"Token verification failed: {e!s}",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or revoked authentication token: {e!s}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(payload.get("sub"))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user ID in token."
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, email, full_name, role, is_active, created_at FROM users WHERE id = ?",
            (user_id,),
        )
        user = cursor.fetchone()

    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated or not found.",
        )

    user_dict = dict(user)
    user_dict["raw_token"] = token
    return user_dict


# ==============================================================================
# Authentication Endpoints
# ==============================================================================


@app.post("/api/auth/login", response_model=TokenResponse)
def login(login_data: UserLogin, request: Request):
    """Authenticates credentials, generates JWT, enforces rate limits, and records audit entry."""
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    username_clean = login_data.username.strip()

    # Rate limiting enforcement (5 attempts per minute per IP / username)
    ip_limited, ip_retry = check_login_rate_limit(f"ip:{ip}")
    user_limited, user_retry = check_login_rate_limit(f"user:{username_clean}")
    if ip_limited or user_limited:
        retry_secs = max(ip_retry, user_retry)
        record_audit_event(
            action="USER_LOGIN_RATE_LIMITED",
            status="SECURITY_ALERT",
            username=username_clean,
            ip_address=ip,
            user_agent=ua,
            details=f"Login rate limit exceeded. Locked out for {retry_secs} seconds.",
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {retry_secs} seconds.",
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, email, full_name, role, password_hash, is_active, created_at FROM users WHERE username = ?",
            (username_clean,),
        )
        user = cursor.fetchone()

    if not user or not verify_password(login_data.password, user["password_hash"]):
        record_login_attempt(f"ip:{ip}")
        record_login_attempt(f"user:{username_clean}")
        record_audit_event(
            action="USER_LOGIN_FAILED",
            status="REFUSED",
            username=username_clean,
            ip_address=ip,
            user_agent=ua,
            details=f"Failed login attempt for username '{username_clean}'",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
        )

    # Clear rate limit trackers upon successful credential validation
    clear_login_attempts(f"ip:{ip}")
    clear_login_attempts(f"user:{username_clean}")

    if not user["is_active"]:
        record_audit_event(
            action="USER_LOGIN_FAILED",
            status="REFUSED",
            user_id=user["id"],
            username=user["username"],
            ip_address=ip,
            user_agent=ua,
            details="Login attempted on deactivated account",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated."
        )

    token = create_access_token(
        data={"sub": user["id"], "username": user["username"], "role": user["role"]}
    )

    record_audit_event(
        action="USER_LOGIN_SUCCESS",
        status="SUCCESS",
        user_id=user["id"],
        username=user["username"],
        ip_address=ip,
        user_agent=ua,
        details="User authenticated successfully",
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            username=user["username"],
            email=user["email"],
            full_name=user["full_name"],
            role=user["role"],
            is_active=bool(user["is_active"]),
            created_at=user["created_at"],
        ),
    )


@app.post("/api/auth/logout")
def logout(request: Request, current_user: dict[str, Any] = Depends(get_current_user)):
    """Immediately revokes the user's active session token."""
    raw_token = current_user.get("raw_token")
    if raw_token:
        revoke_token(raw_token)

    record_audit_event(
        action="USER_LOGOUT",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
        details="Session token immediately revoked",
    )
    return {"message": "Logged out successfully. Token immediately invalidated."}


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: dict[str, Any] = Depends(get_current_user)):
    """Returns profile for currently authenticated user."""
    return UserResponse(
        id=current_user["id"],
        username=current_user["username"],
        email=current_user["email"],
        full_name=current_user["full_name"],
        role=current_user["role"],
        is_active=bool(current_user["is_active"]),
        created_at=current_user["created_at"],
    )


@app.get("/api/health")
def health_check():
    """Health check endpoint for container environments and uptime monitors."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
    return {
        "status": "healthy",
        "timestamp": datetime.now(UTC).isoformat(),
        "database": "connected",
        "storage": "online",
        "version": "1.0.0",
    }


@app.get("/api/users", response_model=list[dict[str, Any]])
def list_users(current_user: dict[str, Any] = Depends(get_current_user)):
    """
    Lists users in the organization.
    Administrators see all users including deactivation status.
    Non-admins see active users for document sharing.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        if current_user["role"] == "admin":
            cursor.execute(
                "SELECT id, username, email, full_name, role, is_active, created_at FROM users ORDER BY username ASC"
            )
        else:
            cursor.execute(
                "SELECT id, username, email, full_name, role FROM users WHERE is_active = 1 ORDER BY username ASC"
            )
        return [dict(r) for r in cursor.fetchall()]


@app.post("/api/users", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Admin-only endpoint to provision a new user account."""
    if current_user["role"] != "admin":
        record_audit_event(
            action="USER_CREATION_DENIED",
            status="REFUSED",
            user_id=current_user["id"],
            username=current_user["username"],
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            details=f"Non-admin '{current_user['username']}' attempted to provision user.",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform administrators can create users.",
        )

    clean_username = user_data.username.strip().lower()
    clean_email = user_data.email.strip().lower()
    now_iso = datetime.now(UTC).isoformat()
    hashed = hash_password(user_data.password)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM users WHERE username = ? OR email = ?",
            (clean_username, clean_email),
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username or email already exists.",
            )

        cursor.execute(
            """
            INSERT INTO users (username, email, full_name, role, password_hash, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        """,
            (
                clean_username,
                clean_email,
                user_data.full_name.strip(),
                user_data.role,
                hashed,
                now_iso,
            ),
        )
        user_id = cursor.lastrowid

    record_audit_event(
        action="USER_CREATED",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
        details=f"Admin created user '{clean_username}' (ID {user_id}, role={user_data.role})",
    )

    return UserResponse(
        id=user_id,
        username=clean_username,
        email=clean_email,
        full_name=user_data.full_name.strip(),
        role=user_data.role,
        is_active=True,
        created_at=now_iso,
    )


@app.put("/api/users/{user_id}/status")
def toggle_user_status(
    user_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Admin-only account activation / deactivation toggle."""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account status modification requires administrator privileges.",
        )

    if user_id == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own administrator account.",
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, is_active FROM users WHERE id = ?", (user_id,)
        )
        target = cursor.fetchone()
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
            )

        new_status = 0 if target["is_active"] else 1
        cursor.execute(
            "UPDATE users SET is_active = ? WHERE id = ?", (new_status, user_id)
        )

    action_name = "USER_ACTIVATED" if new_status else "USER_DEACTIVATED"
    record_audit_event(
        action=action_name,
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
        details=f"Admin toggled user '{target['username']}' active status to {bool(new_status)}",
    )

    return {
        "message": f"User '{target['username']}' is now {'active' if new_status else 'deactivated'}.",
        "user_id": user_id,
        "is_active": bool(new_status),
    }


@app.get("/api/admin/metrics")
def get_admin_metrics(
    request: Request, current_user: dict[str, Any] = Depends(get_current_user)
):
    """Aggregate operational security metrics for Administrator Dashboard."""
    if current_user["role"] != "admin":
        record_audit_event(
            action="ADMIN_METRICS_DENIED",
            status="REFUSED",
            user_id=current_user["id"],
            username=current_user["username"],
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            details="Unauthorized attempt to inspect aggregate platform metrics",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform metrics require administrator privileges.",
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) as total_users, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users FROM users"
        )
        user_row = dict(cursor.fetchone())

        cursor.execute(
            "SELECT COUNT(*) as total_docs, SUM(file_size) as total_bytes FROM documents WHERE is_deleted = 0"
        )
        doc_row = dict(cursor.fetchone())

        cursor.execute("SELECT COUNT(*) as total_grants FROM document_permissions")
        perm_row = dict(cursor.fetchone())

        cursor.execute(
            "SELECT COUNT(*) as total_logs, SUM(CASE WHEN status IN ('REFUSED', 'SECURITY_ALERT') THEN 1 ELSE 0 END) as refused_count FROM audit_logs"
        )
        audit_row = dict(cursor.fetchone())

    return {
        "total_users": user_row["total_users"] or 0,
        "active_users": user_row["active_users"] or 0,
        "active_documents": doc_row["total_docs"] or 0,
        "storage_bytes": doc_row["total_bytes"] or 0,
        "active_permissions": perm_row["total_grants"] or 0,
        "total_audit_records": audit_row["total_logs"] or 0,
        "security_refusals": audit_row["refused_count"] or 0,
    }


# ==============================================================================
# Document Management & Secure Upload Endpoints
# ==============================================================================


@app.post("/api/documents/upload", response_model=DocumentResponse)
async def upload_document(
    request: Request,
    title: str = Form(...),
    category: str = Form("General"),
    sensitivity: str = Form("Confidential"),
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Validates uploaded file (magic bytes, extension, size, sanitization),
    encrypts via AES-256-GCM, stores securely, and records in audit chain.
    Only 'owner' and 'admin' roles can upload new documents.
    """
    if current_user["role"] not in ("owner", "admin"):
        record_audit_event(
            action="DOC_UPLOAD_DENIED",
            status="REFUSED",
            user_id=current_user["id"],
            username=current_user["username"],
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            details=f"Viewer role '{current_user['username']}' attempted document upload.",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document upload is restricted to document owners and administrators.",
        )

    # Validate upload payload (MIME, Magic Bytes, Extension, Size, Sanitization)
    content, clean_filename, extension, canonical_mime = await validate_and_read_upload(
        file
    )

    # Encrypt and store in vault storage
    file_uuid, storage_path, file_size = VaultStorageManager.store_file(content)
    sha256_hash = compute_sha256(content)
    now_iso = datetime.now(UTC).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO documents (
                uuid, title, filename, storage_path, file_size, mime_type,
                sha256_hash, category, sensitivity, owner_id, is_deleted,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        """,
            (
                file_uuid,
                title.strip(),
                clean_filename,
                storage_path,
                file_size,
                canonical_mime,
                sha256_hash,
                category.strip(),
                sensitivity.strip(),
                current_user["id"],
                now_iso,
                now_iso,
            ),
        )
        doc_id = cursor.lastrowid

    # Append to tamper-evident audit trail
    record_audit_event(
        action="DOC_UPLOAD",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=doc_id,
        document_title=title.strip(),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
        details=f"Uploaded '{clean_filename}' ({file_size} bytes, MIME={canonical_mime}, AES-256-GCM encrypted)",
    )

    return DocumentResponse(
        id=doc_id,
        uuid=file_uuid,
        title=title.strip(),
        filename=clean_filename,
        file_size=file_size,
        mime_type=canonical_mime,
        sha256_hash=sha256_hash,
        category=category.strip(),
        sensitivity=sensitivity.strip(),
        owner_id=current_user["id"],
        owner_username=current_user["username"],
        my_permission="owner",
        created_at=now_iso,
        updated_at=now_iso,
    )


@app.get("/api/documents", response_model=list[DocumentResponse])
def list_documents(
    request: Request,
    search: str | None = None,
    category: str | None = None,
    owner: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    CRITICAL ISOLATION: Lists ONLY documents that the user is authorized to reach:
    - User is the document owner
    - OR user was explicitly granted 'read' or 'edit' access
    - Administrators can view documents they own or have grants on, preserving privacy.
    Non-granted documents are completely invisible even in search results or count aggregates.
    """
    user_id = current_user["id"]

    query = """
        SELECT DISTINCT d.id, d.uuid, d.title, d.filename, d.file_size, d.mime_type,
               d.sha256_hash, d.category, d.sensitivity, d.owner_id, u.username as owner_username,
               d.created_at, d.updated_at,
               CASE
                   WHEN d.owner_id = ? THEN 'owner'
                   ELSE dp.permission_level
               END as my_permission
        FROM documents d
        JOIN users u ON d.owner_id = u.id
        LEFT JOIN document_permissions dp ON (dp.document_id = d.id AND dp.user_id = ?)
        WHERE d.is_deleted = 0
          AND (d.owner_id = ? OR dp.user_id = ?)
    """
    params: list[Any] = [user_id, user_id, user_id, user_id]

    if search:
        search_pattern = f"%{search.strip()}%"
        query += " AND (d.title LIKE ? OR d.filename LIKE ?)"
        params.extend([search_pattern, search_pattern])

    if category:
        query += " AND d.category = ?"
        params.append(category.strip())

    if owner:
        query += " AND u.username = ?"
        params.append(owner.strip())

    if start_date:
        query += " AND d.created_at >= ?"
        params.append(start_date.strip())

    if end_date:
        query += " AND d.created_at <= ?"
        params.append(end_date.strip())

    query += " ORDER BY d.created_at DESC"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

    return [
        DocumentResponse(
            id=r["id"],
            uuid=r["uuid"],
            title=r["title"],
            filename=r["filename"],
            file_size=r["file_size"],
            mime_type=r["mime_type"],
            sha256_hash=r["sha256_hash"],
            category=r["category"],
            sensitivity=r["sensitivity"],
            owner_id=r["owner_id"],
            owner_username=r["owner_username"],
            my_permission=r["my_permission"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in rows
    ]


@app.get("/api/documents/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Retrieves document metadata after strict server-side authorization check."""
    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="read",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )

    # Determine caller's permission
    my_perm = "owner" if doc["owner_id"] == current_user["id"] else "read"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT permission_level FROM document_permissions WHERE document_id = ? AND user_id = ?",
            (document_id, current_user["id"]),
        )
        grant = cursor.fetchone()
        if grant:
            my_perm = grant["permission_level"]
        cursor.execute("SELECT username FROM users WHERE id = ?", (doc["owner_id"],))
        owner_row = cursor.fetchone()
        owner_username = owner_row["username"] if owner_row else "unknown"

    record_audit_event(
        action="DOC_READ_METADATA",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=document_id,
        document_title=doc["title"],
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
        details="Document metadata accessed",
    )

    return DocumentResponse(
        id=doc["id"],
        uuid=doc["uuid"],
        title=doc["title"],
        filename=doc["filename"],
        file_size=doc["file_size"],
        mime_type=doc["mime_type"],
        sha256_hash=doc["sha256_hash"],
        category=doc["category"],
        sensitivity=doc["sensitivity"],
        owner_id=doc["owner_id"],
        owner_username=owner_username,
        my_permission=my_perm,
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


@app.get("/api/documents/{document_id}/download")
def download_document(
    document_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    CRITICAL SECURITY CHECKPOINT.
    Decrypts and streams document payload ONLY after authoritative authorization check.
    Zero-caching headers enforced so browser and intermediate proxies never persist plaintext.
    """
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    # Server checks permissions in real-time
    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="read",
        ip_address=ip,
        user_agent=ua,
    )

    # Decrypt from vault storage
    try:
        decrypted_content = VaultStorageManager.retrieve_file(doc["storage_path"])
    except Exception as e:
        record_audit_event(
            action="DOC_DOWNLOAD_ERROR",
            status="SECURITY_ALERT",
            user_id=current_user["id"],
            username=current_user["username"],
            document_id=document_id,
            document_title=doc["title"],
            ip_address=ip,
            user_agent=ua,
            details=f"Decryption or storage retrieval error: {e!s}",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve or decrypt document.",
        )

    # Log successful download in tamper-evident chain
    record_audit_event(
        action="DOC_DOWNLOAD",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=document_id,
        document_title=doc["title"],
        ip_address=ip,
        user_agent=ua,
        details=f"Document payload downloaded ({len(decrypted_content)} bytes)",
    )

    headers = {
        "Content-Disposition": f'attachment; filename="{doc["filename"]}"',
        "Content-Type": doc["mime_type"],
        "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Content-Type-Options": "nosniff",
    }
    return RawResponse(
        content=decrypted_content, media_type=doc["mime_type"], headers=headers
    )


@app.put("/api/documents/{document_id}", response_model=DocumentResponse)
def update_document(
    document_id: int,
    update_data: DocumentUpdate,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Updates document metadata. Strictly requires 'edit' permission or ownership."""
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="edit",
        ip_address=ip,
        user_agent=ua,
    )

    now_iso = datetime.now(UTC).isoformat()
    new_title = update_data.title.strip() if update_data.title else doc["title"]
    new_category = (
        update_data.category.strip() if update_data.category else doc["category"]
    )
    new_sensitivity = (
        update_data.sensitivity if update_data.sensitivity else doc["sensitivity"]
    )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE documents
            SET title = ?, category = ?, sensitivity = ?, updated_at = ?
            WHERE id = ?
        """,
            (new_title, new_category, new_sensitivity, now_iso, document_id),
        )

    record_audit_event(
        action="DOC_UPDATE",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=document_id,
        document_title=new_title,
        ip_address=ip,
        user_agent=ua,
        details=f"Updated document metadata: title='{new_title}', category='{new_category}', sensitivity='{new_sensitivity}'",
    )

    return DocumentResponse(
        id=doc["id"],
        uuid=doc["uuid"],
        title=new_title,
        filename=doc["filename"],
        file_size=doc["file_size"],
        mime_type=doc["mime_type"],
        sha256_hash=doc["sha256_hash"],
        category=new_category,
        sensitivity=new_sensitivity,
        owner_id=doc["owner_id"],
        created_at=doc["created_at"],
        updated_at=now_iso,
    )


@app.put("/api/documents/{document_id}/content", response_model=DocumentResponse)
async def update_document_content(
    document_id: int,
    request: Request,
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Updates document content payload with strict authorization check.
    Requires document ownership or explicit 'edit' permission.
    Re-validates file extension, magic bytes, encrypts with new key, cleans up old file,
    and logs revision event into the cryptographic audit trail.
    """
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="edit",
        ip_address=ip,
        user_agent=ua,
    )

    content, clean_filename, extension, canonical_mime = await validate_and_read_upload(
        file
    )
    old_storage = doc["storage_path"]

    file_uuid, new_storage, file_size = VaultStorageManager.store_file(content)
    new_sha256 = compute_sha256(content)
    now_iso = datetime.now(UTC).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE documents
            SET filename = ?, storage_path = ?, file_size = ?, mime_type = ?,
                sha256_hash = ?, updated_at = ?
            WHERE id = ?
        """,
            (
                clean_filename,
                new_storage,
                file_size,
                canonical_mime,
                new_sha256,
                now_iso,
                document_id,
            ),
        )

    # Securely delete old ciphertext
    VaultStorageManager.delete_file(old_storage)

    record_audit_event(
        action="DOC_VERSION_UPDATED",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=document_id,
        document_title=doc["title"],
        ip_address=ip,
        user_agent=ua,
        details=f"Document content revised with file '{clean_filename}' ({file_size} bytes, SHA256={new_sha256[:12]}...)",
    )

    return DocumentResponse(
        id=doc["id"],
        uuid=file_uuid,
        title=doc["title"],
        filename=clean_filename,
        file_size=file_size,
        mime_type=canonical_mime,
        sha256_hash=new_sha256,
        category=doc["category"],
        sensitivity=doc["sensitivity"],
        owner_id=doc["owner_id"],
        created_at=doc["created_at"],
        updated_at=now_iso,
    )


@app.delete("/api/documents/{document_id}")
def delete_document(
    document_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Deletes document. Strictly restricted to Document Owner."""
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="delete",
        ip_address=ip,
        user_agent=ua,
    )

    now_iso = datetime.now(UTC).isoformat()

    # Soft delete in database + revoke all active grants
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE documents SET is_deleted = 1, updated_at = ? WHERE id = ?",
            (now_iso, document_id),
        )
        cursor.execute(
            "DELETE FROM document_permissions WHERE document_id = ?", (document_id,)
        )

    # Securely delete encrypted file from vault storage
    VaultStorageManager.delete_file(doc["storage_path"])

    record_audit_event(
        action="DOC_DELETE",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=document_id,
        document_title=doc["title"],
        ip_address=ip,
        user_agent=ua,
        details=f"Document '{doc['title']}' deleted by owner {current_user['username']} and permissions revoked.",
    )

    return {"message": f"Document '{doc['title']}' successfully deleted."}


# ==============================================================================
# Access Grants & Immediate Revocation Endpoints
# ==============================================================================


@app.get(
    "/api/documents/{document_id}/permissions", response_model=list[PermissionEntry]
)
def list_document_permissions(
    document_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Lists current permission grants for a document. Restricted to Document Owner."""
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="manage_permissions",
        ip_address=ip,
        user_agent=ua,
    )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT dp.user_id, u.username, u.full_name, u.email, dp.permission_level,
                   dp.granted_by, g.username as granted_by_username, dp.granted_at
            FROM document_permissions dp
            JOIN users u ON dp.user_id = u.id
            JOIN users g ON dp.granted_by = g.id
            WHERE dp.document_id = ?
            ORDER BY dp.granted_at DESC
        """,
            (document_id,),
        )
        rows = cursor.fetchall()

    return [
        PermissionEntry(
            user_id=r["user_id"],
            username=r["username"],
            full_name=r["full_name"],
            email=r["email"],
            permission_level=r["permission_level"],
            granted_by=r["granted_by"],
            granted_by_username=r["granted_by_username"],
            granted_at=r["granted_at"],
        )
        for r in rows
    ]


@app.post("/api/documents/{document_id}/permissions")
def grant_document_permission(
    document_id: int,
    grant_req: PermissionGrantRequest,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Grants named read or edit access to a specific user.
    Strictly restricted to the document owner.
    """
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="manage_permissions",
        ip_address=ip,
        user_agent=ua,
    )

    # Resolve target user
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, email, full_name, is_active FROM users WHERE username = ? OR id = ?",
            (grant_req.target_username_or_id, grant_req.target_username_or_id),
        )
        target_user = cursor.fetchone()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found."
        )

    if target_user["id"] == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot grant permission to yourself; you are already the owner.",
        )

    now_iso = datetime.now(UTC).isoformat()

    # Insert or update permission grant
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO document_permissions (document_id, user_id, permission_level, granted_by, granted_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(document_id, user_id) DO UPDATE SET
                permission_level = excluded.permission_level,
                granted_by = excluded.granted_by,
                granted_at = excluded.granted_at
        """,
            (
                document_id,
                target_user["id"],
                grant_req.permission_level,
                current_user["id"],
                now_iso,
            ),
        )

    record_audit_event(
        action="PERMISSION_GRANTED",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=document_id,
        document_title=doc["title"],
        ip_address=ip,
        user_agent=ua,
        details=f"Granted '{grant_req.permission_level}' access to user '{target_user['username']}' (ID {target_user['id']})",
    )

    return {
        "message": f"Successfully granted '{grant_req.permission_level}' access to {target_user['username']}.",
        "target_user_id": target_user["id"],
        "target_username": target_user["username"],
        "permission_level": grant_req.permission_level,
    }


@app.delete("/api/documents/{document_id}/permissions/{target_user_id}")
def revoke_document_permission(
    document_id: int,
    target_user_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    IMMEDIATE REVOCATION ENDPOINT.
    Revokes access right now. Any subsequent request by target user is instantly blocked.
    Strictly restricted to the document owner.
    """
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="manage_permissions",
        ip_address=ip,
        user_agent=ua,
    )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users WHERE id = ?", (target_user_id,))
        target_user = cursor.fetchone()
        target_name = target_user["username"] if target_user else f"ID {target_user_id}"

        cursor.execute(
            "DELETE FROM document_permissions WHERE document_id = ? AND user_id = ?",
            (document_id, target_user_id),
        )
        deleted_count = cursor.rowcount

    record_audit_event(
        action="PERMISSION_REVOKED",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=document_id,
        document_title=doc["title"],
        ip_address=ip,
        user_agent=ua,
        details=f"IMMEDIATE REVOCATION: Revoked access from user '{target_name}' (ID {target_user_id})",
    )

    return {
        "message": f"Access for user {target_name} immediately revoked.",
        "revoked_user_id": target_user_id,
        "affected_rows": deleted_count,
    }


# ==============================================================================
# AI Access Assistant Endpoints
# ==============================================================================


@app.post(
    "/api/documents/{document_id}/ai-suggest", response_model=AISuggestionResponse
)
def ai_suggest_access(
    document_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    AI Access Recommendation.
    Produces advice based on document category, sensitivity, and org clearance.
    Guaranteed Safety Invariant: Does not alter permissions directly.
    """
    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="manage_permissions",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )

    return generate_access_recommendations(
        document=doc,
        requesting_user=current_user,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )


@app.post("/api/documents/{document_id}/ai-confirm")
def ai_confirm_access(
    document_id: int,
    grant_req: PermissionGrantRequest,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Human Owner confirmation of an AI access suggestion.
    Records both the recommendation context and the human confirmation in the audit trail.
    """
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    doc = check_document_access(
        user=current_user,
        document_id=document_id,
        required_action="manage_permissions",
        ip_address=ip,
        user_agent=ua,
    )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username FROM users WHERE username = ? OR id = ?",
            (grant_req.target_username_or_id, grant_req.target_username_or_id),
        )
        target_user = cursor.fetchone()

    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found.")

    now_iso = datetime.now(UTC).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO document_permissions (document_id, user_id, permission_level, granted_by, granted_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(document_id, user_id) DO UPDATE SET
                permission_level = excluded.permission_level,
                granted_by = excluded.granted_by,
                granted_at = excluded.granted_at
        """,
            (
                document_id,
                target_user["id"],
                grant_req.permission_level,
                current_user["id"],
                now_iso,
            ),
        )

    record_audit_event(
        action="AI_ACCESS_SUGGESTION_CONFIRMED",
        status="SUCCESS",
        user_id=current_user["id"],
        username=current_user["username"],
        document_id=document_id,
        document_title=doc["title"],
        ip_address=ip,
        user_agent=ua,
        details=f"Human owner approved AI suggestion: granted '{grant_req.permission_level}' to user '{target_user['username']}'",
    )

    return {
        "message": f"AI recommendation confirmed by human owner. Access granted to {target_user['username']}.",
        "target_user_id": target_user["id"],
        "target_username": target_user["username"],
        "permission_level": grant_req.permission_level,
    }


# ==============================================================================
# Audit Trail & Cryptographic Verification Endpoints
# ==============================================================================


@app.get("/api/audit")
def view_audit_log(
    request: Request,
    document_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Retrieves audit logs.
    - Document Owner: Can view audit logs for documents they own.
    - Administrator: Can view system-wide audit logs.
    - Viewers: Cannot access system audit logs (returns 403).
    """
    role = current_user["role"]

    if document_id is not None:
        # Check that user owns or is admin of this document
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT owner_id FROM documents WHERE id = ?", (document_id,)
            )
            doc = cursor.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        if role != "admin" and doc["owner_id"] != current_user["id"]:
            record_audit_event(
                action="AUDIT_VIEW_DENIED",
                status="REFUSED",
                user_id=current_user["id"],
                username=current_user["username"],
                document_id=document_id,
                details="Viewer attempted to read document audit logs without ownership.",
            )
            raise HTTPException(
                status_code=403,
                detail="Audit log inspection for this document requires ownership or administrative privileges.",
            )
    else:
        # Global audit log view: strictly administrator
        if role != "admin":
            record_audit_event(
                action="GLOBAL_AUDIT_VIEW_DENIED",
                status="REFUSED",
                user_id=current_user["id"],
                username=current_user["username"],
                details=f"Non-admin user '{current_user['username']}' attempted global audit trail inspection.",
            )
            raise HTTPException(
                status_code=403,
                detail="Global audit log inspection is restricted to platform administrators.",
            )

    logs = get_audit_trail(document_id=document_id, limit=limit, offset=offset)
    return logs


@app.get("/api/audit/verify", response_model=AuditVerificationResult)
def verify_audit_chain(
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    CRYPTOGRAPHIC INTEGRITY VERIFICATION.
    Validates the entire HMAC-SHA256 hash chain from genesis to the latest record.
    Restricted to Administrator or Document Owner.
    """
    if current_user["role"] not in ("admin", "owner"):
        raise HTTPException(
            status_code=403,
            detail="Cryptographic verification requires administrator or owner credentials.",
        )

    result = verify_audit_integrity()
    return AuditVerificationResult(**result)


@app.get("/api/audit/alerts")
def get_security_alerts(
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Retrieves security alerts: all refused access attempts, IDOR probes, and security violations.
    Restricted to Platform Administrator.
    """
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Security alert inspection requires platform administrator role.",
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, sequence_number, timestamp, user_id, username, action,
                   document_id, document_title, status, ip_address, details
            FROM audit_logs
            WHERE status IN ('REFUSED', 'SECURITY_ALERT')
            ORDER BY sequence_number DESC
            LIMIT 50
        """)
        alerts = [dict(r) for r in cursor.fetchall()]

    return alerts


# ==============================================================================
# Static Files & Single Page Application Serving
# ==============================================================================

frontend_path = BASE_DIR / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")


@app.get("/")
def serve_index():
    """Serves the TrustVault Single Page Application interface."""
    index_file = BASE_DIR / "frontend" / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "TrustVault Security API is active. Frontend is loading."}


# Startup initialization is handled by the lifespan context manager above.
