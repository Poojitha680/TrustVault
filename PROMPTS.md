# TrustVault — AI Interaction & Prompt Log (PROMPTS.md)

This document tracks how AI was used during the design and development of TrustVault, detailing specific prompts, flaws identified in the AI's suggestions (particularly around authorization, access control, and audit integrity), and the authoritative engineering remedies implemented.

---

## Reusable System Directives & Context Files Used

Throughout development, the following system prompt and security constraints were consistently enforced:

```markdown
SYSTEM CONSTRAINTS FOR TRUSTVAULT:
1. Server-authoritative enforcement: The server decides every request. Never rely on frontend UI hiding for access control.
2. Immediate revocation: Taking access away must take effect on the very next HTTP request. Do not store authorization state in static JWT claims.
3. Cryptographic audit integrity: Every access decision (success or refusal) must be logged into a tamper-evident HMAC-SHA256 chain protected against modification and deletion.
4. Least privilege: Differentiate in-browser preview from downloading. Public self-registration must unconditionally default to the Viewer role.
```

---

## Log Entry 1: Immediate Permission Revocation vs. JWT Claims
- **Date:** 2026-10-21
- **Focus Area:** Authorization & Access Control

### 1. What was asked
> *"Design a permission check for TrustVault. When an owner grants or revokes document access, how should the backend check permissions on `/api/documents/{id}/download` quickly without hammering the database?"*

### 2. What the AI produced
The AI suggested encoding granted document IDs and permission levels directly into the user's JWT access token:
```python
# Flawed AI suggestion:
token_payload = {
    "sub": user_id,
    "role": user_role,
    "accessible_docs": [1, 2, 4],  # Document IDs encoded in token
    "permissions": {"1": "read", "2": "edit"}
}
```
The AI claimed this approach eliminated database lookups on every file download.

### 3. What was wrong with it (Critical Security Defect)
Encoding document permissions inside JWT claims violates the **Immediate Revocation** requirement:
- When an owner revokes a user's access, the user's existing JWT remains cryptographically valid until its expiration (e.g. 1 hour).
- The user would be able to continue downloading confidential files for the remaining lifetime of the token.
- Furthermore, as a user is granted access to hundreds of documents, the JWT header size explodes, causing HTTP 431 Request Header Fields Too Large errors.

### 4. What was done instead
Discarded the AI's approach entirely. In [`backend/app/authz.py`](file:///backend/app/authz.py), dynamic request-time verification against the database source of truth was implemented:
- JWT tokens contain only user identity (`sub`, `username`, `role`, `jti`).
- Every document access request executes [`check_document_access()`](file:///backend/app/authz.py), checking the live `document_permissions` table.
- When an owner revokes a grant (`DELETE /api/documents/{id}/permissions/{target_user_id}`), the subsequent access attempt returns HTTP `403 Forbidden` with zero latency.
- Verified in automated test: [`test_immediate_enforcement_of_revoked_permissions`](file:///backend/tests/test_document_isolation.py).

---

## Log Entry 2: Audit Trail Immutability & Hash Chain Design
- **Date:** 2026-10-22
- **Focus Area:** Audit Trail & Cryptographic Evidence

### 1. What was asked
> *"Create an audit logging service that records document access and ensures logs cannot be modified by attackers or admins."*

### 2. What the AI produced
The AI generated a standard SQLAlchemy model with an `updated_at` column and an application-level helper function:
```python
# Flawed AI suggestion:
def record_audit(db, user_id, action, doc_id):
    entry = AuditLog(user_id=user_id, action=action, doc_id=doc_id, created_at=datetime.utcnow())
    db.add(entry)
    db.commit()
```
When asked how to prevent tampering, the AI suggested checking `if current_user.role != "admin"` in a DELETE endpoint.

### 3. What was wrong with it (Architectural Vulnerability)
- If an adversary compromises the database via SQL injection or direct SQLite/PostgreSQL access, application-level checks do not stop direct `UPDATE audit_logs` or `DELETE FROM audit_logs` queries.
- Furthermore, standard logs cannot prove whether an intermediate log entry was deleted (truncation / redaction attack). Without cryptographic linking, an audit trail cannot serve as non-repudiation evidence in a legal or regulatory dispute.

### 4. What was done instead
Implemented a two-tier cryptographic defense in [`backend/app/audit.py`](file:///backend/app/audit.py) and [`backend/app/database.py`](file:///backend/app/database.py):
1. **HMAC-SHA256 Hash Chain:** Each log entry computes:
   `entry_hash = HMAC(key, sequence + timestamp + user + action + doc_id + status + details + previous_hash)`
   This forms a blockchain-style append-only chain where modifying, inserting, or removing any log entry breaks the cryptographic digest of all subsequent entries.
2. **Database Triggers:** Implemented SQLite triggers `prevent_audit_update` and `prevent_audit_delete` directly in the database engine, raising a fatal `RAISE(ABORT)` on any update or delete SQL operation.
3. **Verification Tool:** Built `POST /api/audit/verify` to validate the full sequence from #1 to latest.
- Verified in automated tests: [`test_audit_chain_is_initially_valid`](file:///backend/tests/test_audit_integrity.py) and [`test_audit_db_triggers_prevent_direct_sql_tampering`](file:///backend/tests/test_audit_integrity.py).

---

## Log Entry 3: File Upload Validation & Extension Spoofing
- **Date:** 2026-10-23
- **Focus Area:** Application Security & Upload Pipeline

### 1. What was asked
> *"Write a file upload validation function for FastAPI that accepts documents (PDF, DOCX, PNG) and blocks malicious files."*

### 2. What the AI produced
```python
# Flawed AI suggestion:
def validate_upload(file: UploadFile):
    allowed_types = ["application/pdf", "image/png", "application/msword"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Invalid file type")
    return file
```

### 3. What was wrong with it (Trivial Bypass)
- The `UploadFile.content_type` header is sent by the client's browser and can be spoofed trivially using `curl -F "file=@evil.exe;type=application/pdf"`.
- It did not inspect binary magic bytes.
- It did not check for dangerous double extensions (e.g. `invoice.pdf.exe`).
- It did not sanitize filenames against directory traversal (`../../etc/passwd`).

### 4. What was done instead
Built a multi-stage validation engine in [`backend/app/validator.py`](file:///backend/app/validator.py):
1. **Filename Sanitization:** Statically inspects extensions, rejects executable patterns (`.exe`, `.sh`, `.php`, `.bat`, `.ps1`), and strips paths via `os.path.basename`.
2. **Double Extension Rejection:** Scans all dots in the filename to block polyglot naming.
3. **Magic Byte Verification:** Reads the initial 32 bytes of the payload and verifies binary signatures:
   - PDF: `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`)
   - PNG: `\x89PNG\r\n\x1a\n`
   - JPEG: `\xFF\xD8\xFF`
   - DOCX: `PK\x03\x04`
4. Rejects content-type mismatches and enforces a 50 MB hard ceiling.
- Verified in automated tests: [`test_upload_security.py`](file:///backend/tests/test_upload_security.py) (4 separate security attack vector tests).

---

## Log Entry 4: Separation of In-Browser Preview vs. Download
- **Date:** 2026-10-24
- **Focus Area:** Authorization & Access Control

### 1. What was asked
> *"Implement the Viewer role requirements. Viewers should have read-only access. Should I just return the document download URL when they click preview?"*

### 2. What the AI produced
The AI suggested reusing the existing `/api/documents/{id}/download` endpoint for previews, simply hiding the "Download" button on the frontend for users with the Viewer role:
```javascript
// Flawed AI suggestion:
{user.role !== 'viewer' && <button onClick={downloadDoc}>Download</button>}
```

### 3. What was wrong with it (Violates Prompt Specification)
- The user prompt explicitly stated:
  > *"Do not implement viewer restrictions only by hiding buttons... Viewing and downloading are separate permissions. Never assume that permission to view automatically grants permission to download."*
- If the backend uses the same endpoint for both preview and download, any viewer can easily open browser DevTools, copy the `/download` URL, and save the file to local disk.

### 4. What was done instead
Implemented strict bifurcation between previewing and downloading:
1. **In-Browser Preview:** Decrypted stream endpoint `GET /api/documents/{id}/preview` in [`backend/app/main.py`](file:///backend/app/main.py#L968). Sets `Content-Disposition: inline` and strict `Cache-Control: no-store`. Permitted by default for authorized viewers.
2. **File Download:** Separate endpoint `GET /api/documents/{id}/download` with `Content-Disposition: attachment`.
3. In [`backend/app/authz.py`](file:///backend/app/authz.py#L127), the download checkpoint checks if `role == "viewer"`. If neither the document policy (`allow_viewer_download == 1`) nor the user's specific grant (`can_download == 1`) permits downloading, the request is blocked with HTTP `403 Forbidden`.
- Verified in automated test: [`test_8_viewer_cannot_download_document_when_downloading_not_permitted`](file:///backend/tests/test_viewer_and_registration.py).

---

## Log Entry 5: Public Registration Privilege Escalation
- **Date:** 2026-10-25
- **Focus Area:** Authentication & User Lifecycle

### 1. What was asked
> *"Add user registration to TrustVault with full name, email, password, and role selection."*

### 2. What the AI produced
```python
# Flawed AI suggestion:
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    password: str
    role: str = "viewer"  # Default viewer, but accepts input

@app.post("/api/auth/register")
def register(data: UserRegister):
    user = create_user(role=data.role, ...)  # Vulnerability: Accepts client-supplied role
```

### 3. What was wrong with it (Mass Assignment / Privilege Escalation)
Allowing the public registration endpoint to accept a `role` parameter allows any anonymous user to send `{"role": "admin"}` in their registration POST body, instantly granting themselves administrative control over the entire platform.

### 4. What was done instead
Hardened the public registration flow in [`backend/app/main.py`](file:///backend/app/main.py#L324):
- The `UserRegister` schema in [`backend/app/schemas.py`](file:///backend/app/schemas.py) does not expose `role`.
- The endpoint unconditionally hardcodes `role = "viewer"`.
- Role assignment and elevation is strictly restricted to authenticated administrators via the dedicated endpoint `PUT /api/users/{id}/role`.
- Passwords are validated for complexity and hashed with Argon2id before saving.
- Verified in automated tests: [`test_4_newly_registered_user_receives_default_viewer_role`](file:///backend/tests/test_viewer_and_registration.py) and [`test_9_viewer_cannot_promote_themselves_to_administrator`](file:///backend/tests/test_viewer_and_registration.py).
