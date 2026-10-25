# TrustVault — High-Assurance Confidential Document Platform

> **A platform where the wrong person cannot reach a document, and where you can prove exactly who reached it.**

---

## 1. Quick Start & Seed Credentials

### Live Local Environment
- **Frontend Application:** [http://127.0.0.1:5173](http://127.0.0.1:5173)
- **Backend API & Swagger Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Backend Health Check:** [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

### Seed Accounts by Role
The database comes seeded with accounts representing each role. You can also use the one-click **Persona Testing Bar** at the top of the frontend to switch identities instantly:

| Role | Username | Password | Persona & Scope |
|---|---|---|---|
| **Administrator** | `admin` | `AdminPassword123!` | Platform Security Officer. Operational oversight of vault documents, user account controls, role management, and cryptographic audit chain verification. (Separation of duties: Cannot download private restricted files without explicit grant). |
| **Document Manager (Owner)** | `alice_owner` | `OwnerPassword123!` | Finance Director. Full ownership of payroll & financial records; uploads, edits, downloads, grants, and revokes permissions. |
| **Document Manager (Owner)** | `bob_owner` | `OwnerPassword123!` | Lead Engineer. Full ownership of turbine blueprints & engineering schematics. |
| **Viewer (Read-Only)** | `charlie_viewer` | `ViewerPassword123!` | Auditor. Strictly read-only access to documents granted to him; in-browser preview; downloads blocked unless explicitly permitted. |
| **Viewer (Unauthorized Outlier)** | `eve_attacker` | `AttackerPassword123!` | External viewer with zero document grants; used to demonstrate IDOR rejections and probe alerts. |

---

## 2. Clean Clone Setup & Deployment Instructions

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### 1. Backend Setup
```bash
# Clone the repository
git clone <repo_url>
cd TrustVault

# Create virtual environment and install dependencies
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt

# Start backend server (port 8000)
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install

# Start Vite dev server (port 5173)
npm run dev -- --host 127.0.0.1
```

### 3. Running the Automated Test Suite
The test suite executes against an isolated, temporary SQLite test database and does not alter development/production data:
```bash
# Run all 36 tests with verbose output
.venv\Scripts\pytest -v
```

---

## 3. The Three Non-Negotiable Tenets

### 1. The Server Decides, Every Time
A document is reachable only by someone who was explicitly granted access. 
- Access control is **never** left to the client. The frontend hides buttons for UX clarity, but every backend API route (`/preview`, `/download`, `GET /documents/{id}`, `PUT /documents/{id}`, `DELETE /documents/{id}`, `/permissions`) authoritatively routes through [`check_document_access()`](file:///backend/app/authz.py).
- Non-granted attempts are stopped with HTTP `403 Forbidden` and synchronously recorded as `REFUSED` security events in the audit trail.

### 2. Cryptographically Provable, Immutable Audit Trail
You can prove who accessed or attempted to access a document:
- **HMAC-SHA256 Hash Chain:** Every audit event links cryptographically to the preceding event:
  `entry_hash = HMAC(secret_key, seq + timestamp + user + action + doc_id + status + details + previous_hash)`
- **Database Abort Triggers:** SQLite triggers `prevent_audit_update` and `prevent_audit_delete` abort any `UPDATE` or `DELETE` statement against `audit_logs` at the database engine level.
- **Verification Endpoint:** `POST /api/audit/verify` re-computes every block from #1 to the latest record, detecting any deletion, insertion, or alteration.

### 3. Immediate Revocation (Zero Latency)
Taking access away works immediately:
- Access decisions are evaluated against the database source of truth on **every single request**.
- Document grants are **never cached in static JWT claims**.
- Revoking a grant via `DELETE /api/documents/{id}/permissions/{target_user_id}` denies the user's very next HTTP request within milliseconds.
- Logout immediately invalidates tokens via the `revoked_tokens` table.

---

## 4. The Permission Model in Our Own Words

TrustVault implements a **resource-centric, named-grant Access Control List (ACL)** with role-based governance:

1. **Document Ownership:** The user who uploads a document is its `owner`. The owner holds exclusive authority to delete the document, revise its payload, and grant/revoke access.
2. **Named Grants:** Access is granted to specific users by username or ID with a defined level:
   - `read`: Permits metadata viewing and in-browser preview stream.
   - `edit`: Permits metadata updates and new content revision commits.
   - `can_download`: A separate boolean permission flag. Viewing does NOT imply downloading.
3. **Viewer Role Boundary:** Users with the `viewer` role are strictly read-only. Even if granted `edit` by an owner, the backend rejects it. Viewers can preview decrypted streams inline, but downloading is rejected unless explicitly granted.
4. **Administrator Role Boundary:** Administrators manage users, assign roles, inspect operational metadata, and verify audit integrity. Under **Separation of Duties**, administrators cannot download confidential document payloads without an explicit owner grant.

---

## 5. Answers to the Core Technical & Interview Questions

### Q1: Where is the authorization decision made when someone downloads a file, and what would happen if that line were removed?
- **Exact Location:** In [`backend/app/main.py`](file:///backend/app/main.py#L1045) inside `def download_document()`:
  ```python
  doc = check_document_access(
      user=current_user,
      document_id=document_id,
      required_action="download",
      ip_address=ip,
      user_agent=ua,
  )
  ```
  which calls [`check_document_access()`](file:///backend/app/authz.py#L38) in [`backend/app/authz.py`](file:///backend/app/authz.py).
- **What happens if that line were removed?**
  Removing this call would create a critical IDOR vulnerability where any authenticated user could pass any `document_id` and download the decrypted file.
  **Our automated tests catch this immediately:** Running `pytest` without this call causes [`test_cross_user_isolation_bob_cannot_access_alice_document`](file:///backend/tests/test_document_isolation.py), [`test_admin_separation_of_duties`](file:///backend/tests/test_document_isolation.py), and [`test_8_viewer_cannot_download_document_when_downloading_not_permitted`](file:///backend/tests/test_viewer_and_registration.py) to **fail immediately with assertion errors**.

### Q2: What stops the audit trail from being altered?
1. **Engine-Level Database Triggers:** SQLite triggers `prevent_audit_update` and `prevent_audit_delete` explicitly raise `RAISE(ABORT)` on any update or delete SQL statement.
2. **Cryptographic HMAC-SHA256 Hash Chain:** Each record contains `previous_hash` and `entry_hash`. Any modification of an actor, timestamp, or action breaks the hash chain for all subsequent records.
3. **Refused Probes Logged Synchronously:** When an attacker attempts an IDOR probe, the refusal is committed to the hash chain *before* the HTTP 403 response is returned.

### Q3: What does "taking access away immediately" mean, and what does it cost?
- **Meaning:** When Alice revokes Charlie's grant, Charlie's next HTTP request (even milliseconds later) receives HTTP 403 Forbidden.
- **Cost:** We deliberately do not store document permissions inside JWT tokens. Evaluating permissions requires an indexed SQL query (`idx_perm_doc_user`) on each document request. The cost is an indexed read (~0.2ms in SQLite/Postgres), which is the acceptable trade-off for true zero-trust revocation.

### Q4: How are files stored, and what makes them unreachable without authorization?
- Files are stored in `vault_storage/` under random UUID filenames (`a3f2b1...`).
- Stored files are **never plaintext**: they are encrypted at rest with **AES-256-GCM** using a 96-bit initialization vector and 128-bit authentication tag.
- Storage files cannot be served directly by a web server (no static folder exposure); they can only be decrypted in memory by `VaultStorageManager.decrypt_file()` after `check_document_access()` passes.

### Q5: Where does AI fit, and where must it NOT decide?
- **Where it fits:** The AI assistant in [`backend/app/ai_assistant.py`](file:///backend/app/ai_assistant.py) analyzes document category and sensitivity to suggest recommended peer reviewers or compliance officers.
- **Where it MUST NOT decide:** The machine **never widens access autonomously**. Suggestions require an explicit human confirmation click by the document owner, and both the AI recommendation and the human confirmation are recorded in the audit log.

---

## 6. Complete API Endpoint Authorization Reference

| Method | Endpoint | Allowed Roles / Scope | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public (Anonymous) | Public account registration. Forces `role = "viewer"`. |
| `POST` | `/api/auth/login` | Public (Anonymous) | Authenticates credentials; returns JWT token. Rate-limited. |
| `POST` | `/api/auth/logout` | Authenticated (All roles) | Immediately revokes active session token in `revoked_tokens`. |
| `GET` | `/api/auth/me` | Authenticated (All roles) | Returns current user profile. |
| `GET` | `/api/documents` | Authenticated (All roles) | Lists accessible documents (Own + Granted for users; entire vault for Admin). |
| `POST` | `/api/documents/upload` | `owner`, `admin` | Validates file, encrypts with AES-256-GCM, stores ciphertext. (Viewers receive 403). |
| `GET` | `/api/documents/{id}` | Owner, Admin, or Granted User | Retrieves document metadata. Unauthorized users receive 403. |
| `GET` | `/api/documents/{id}/preview` | Owner, Admin, or Granted User | Streams decrypted content inline with zero-cache headers. |
| `GET` | `/api/documents/{id}/download` | Owner, Granted Downloaders | Downloads file attachment. Blocked for viewers without download grant. |
| `PUT` | `/api/documents/{id}` | Owner, Admin, or Granted Editor | Updates document title, category, sensitivity, or download policy. |
| `PUT` | `/api/documents/{id}/content` | Owner, Admin, or Granted Editor | Commits new encrypted file payload version while retaining audit log. |
| `DELETE`| `/api/documents/{id}` | Owner, Admin | Soft-deletes document and revokes all active grants. |
| `GET` | `/api/documents/{id}/permissions` | Owner, Admin | Lists all active permission grants for a document. |
| `POST` | `/api/documents/{id}/permissions` | Owner, Admin | Grants `read` or `edit` access (and optional download flag) to a named user. |
| `DELETE`| `/api/documents/{id}/permissions/{user_id}` | Owner, Admin | Immediately revokes access for target user. |
| `POST` | `/api/documents/{id}/ai-suggest` | Owner, Admin | Generates access recommendations (Human-in-the-loop). |
| `POST` | `/api/documents/{id}/ai-confirm` | Owner, Admin | Confirms AI suggestion and applies grant. |
| `GET` | `/api/audit` | `admin` (or `?mine=true` for all) | Global audit trail for Admin; personal activity history when `mine=true`. |
| `POST` | `/api/audit/verify` | `admin` | Cryptographically verifies HMAC-SHA256 audit hash chain. |
| `GET` | `/api/audit/alerts` | `admin` | Real-time security alerts and refused IDOR probes. |
| `GET` | `/api/users` | `admin` | Lists all user accounts. |
| `POST` | `/api/users` | `admin` | Provisions a new user account. |
| `PUT` | `/api/users/{id}/status` | `admin` | Activates or deactivates user account (instant token revocation). |
| `PUT` | `/api/users/{id}/role` | `admin` | Updates user role (`admin`, `owner`, `viewer`). |
| `GET` | `/api/admin/metrics` | `admin` | System-wide encryption and document storage metrics. |

---

## 7. What We Chose Not to Build & Why

1. **Folder-Hierarchy Inheritance:**
   - *Why rejected:* Folder-based inheritance is the leading cause of enterprise permissions leaks ("someone is given access to a folder for one file and can now see forty"). TrustVault uses explicit per-document grants.
2. **Public Shareable Links:**
   - *Why rejected:* Unauthenticated token URLs ("anyone with the link can view") inevitably leak via email forwarding and chat channels, and destroy auditability ("who opened this?"). Every request requires authentication.
3. **Client-Side Bulk Decryption:**
   - *Why rejected:* Delivering keys to the client for client-side decryption would compromise zero-cache protections and allow raw keys to be extracted from browser memory.
