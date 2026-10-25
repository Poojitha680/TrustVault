# TrustVault — Threat Model & Security Architecture (THREATS.md)

This document formalizes the threat landscape, adversary capabilities, cryptographic invariants, mitigations, and accepted residual risks for **TrustVault: High-Assurance Confidential Document Platform**.

---

## 1. System Overview & Core Invariants

TrustVault solves two fundamental enterprise security failures:
1. **Permission Creep & Zombie Grants:** A user is granted access to a folder to inspect one file, and gains visibility into forty. A contractor leaves the firm, and their link or token persists.
2. **Audit Evaporation:** When a confidential document leaks, the organization cannot prove who accessed it, who downloaded it, or what unauthorized probes were attempted and refused.

### The Three Non-Negotiable Tenets
1. **Server-Authoritative Enforcement:** A document is reachable only by someone explicitly granted access. Client-side checks or hidden buttons are presentation hints only; the centralized server authorization engine (`authz.py`) decides every request.
2. **Provable, Tamper-Evident Auditability:** Every view, preview, download, upload, metadata change, deletion, permission change, and refused attempt is recorded synchronously into an immutable, cryptographic HMAC-SHA256 hash chain protected by database abort triggers.
3. **Immediate Revocation (Zero-Delay):** When an owner takes access away, all subsequent access attempts are immediately rejected on the very next HTTP request without waiting for token expiration.

---

## 2. Threat Analysis & Mitigations Matrix

### Threat 1: Insecure Direct Object Reference (IDOR) & URL Probing
- **Severity:** Critical
- **Adversary Goal:** An authenticated user (e.g., `eve_attacker` or `charlie_viewer`) guesses or increments sequential document IDs (`GET /api/documents/1/download`) to access documents belonging to other users.
- **Attack Vectors:** Direct URL tampering, intercepting API payloads in proxy tools, or probing through API endpoints.
- **TrustVault Mitigation:**
  - Authoritative checkpoint [`check_document_access()`](file:///backend/app/authz.py).
  - Every endpoint (`/preview`, `/download`, `GET /documents/{id}`, `PUT /documents/{id}`, `DELETE /documents/{id}`, `/permissions`) delegates to `check_document_access()`.
  - The SQL authorization query checks `(d.owner_id = user_id OR dp.user_id = user_id)`. Non-granted requests fail immediately with HTTP `403 Forbidden`.
  - Every denied attempt is recorded synchronously with status `REFUSED` in the audit chain.
- **Automated Test Coverage:** [`test_cross_user_isolation_bob_cannot_access_alice_document`](file:///backend/tests/test_document_isolation.py), [`test_7_viewer_cannot_access_another_users_private_documents`](file:///backend/tests/test_viewer_and_registration.py), [`test_10_direct_api_requests_cannot_bypass_viewer_restrictions`](file:///backend/tests/test_viewer_and_registration.py).

---

### Threat 2: Administrator Privilege Escalation & Snooping (Separation of Duties)
- **Severity:** High
- **Adversary Goal:** A rogue platform administrator or compromised admin credential is used to covertly read or download confidential executive payroll, patent blueprints, or legal disputes.
- **Attack Vectors:** Exploiting wildcard `admin` permissions to access file payload bytes.
- **TrustVault Mitigation:**
  - Strict separation of duties enforced in [`authz.py`](file:///backend/app/authz.py#L91).
  - Administrators possess operational oversight (managing accounts, updating user roles, verifying audit integrity, toggling active status, and inspecting aggregate metadata), but are **strictly prohibited from downloading raw private confidential document bytes** without an explicit direct grant from the document owner.
  - Attempting to download private restricted documents without a grant returns HTTP `403 Forbidden` and raises a `SECURITY_ALERT` in the audit logs.
- **Automated Test Coverage:** [`test_admin_separation_of_duties`](file:///backend/tests/test_document_isolation.py).

---

### Threat 3: Delayed Revocation, Zombie Tokens & Stale Caching
- **Severity:** High
- **Adversary Goal:** After an owner revokes a user's permission or an employee is terminated, the user continues downloading files using cached browser state, lingering authorization tokens, or CDN edge caches.
- **Attack Vectors:** Long-lived JWT tokens, browser disk caching, HTTP `304 Not Modified` ETags.
- **TrustVault Mitigation:**
  - Database-backed grant verification on every single operation. No client-side JWT claims store document permission levels; permission is evaluated dynamically against the live database at request time.
  - Revoking a grant via `DELETE /api/documents/{id}/permissions/{target_user_id}` takes effect instantaneously.
  - User logout immediately writes the JWT token `jti` to the `revoked_tokens` table.
  - All document content endpoints return zero-cache headers:
    `Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0`
    `Pragma: no-cache`
- **Automated Test Coverage:** [`test_immediate_enforcement_of_revoked_permissions`](file:///backend/tests/test_document_isolation.py), [`test_immediate_token_revocation_on_logout`](file:///backend/tests/test_auth_and_rate_limiting.py).

---

### Threat 4: Audit Log Modification, Truncation, or Retroactive Alteration
- **Severity:** Critical
- **Adversary Goal:** An insider or attacker who gains database access alters or deletes audit records to conceal illicit access, or injects fabricated logs.
- **Attack Vectors:** SQL injection, compromised database credentials, manual table edits.
- **TrustVault Mitigation:**
  - **Cryptographic Hash Chain:** Each log entry computes `entry_hash = HMAC-SHA256(secret_key, sequence + timestamp + user_id + action + doc_id + status + details + previous_hash)`.
  - The chain links entry `N` to entry `N-1`. Any deleted entry, inserted entry, or modified timestamp/user invalidates all subsequent hashes.
  - **Database Triggers:** SQLite triggers `prevent_audit_update` and `prevent_audit_delete` abort any `UPDATE` or `DELETE` statement against `audit_logs` with a security violation exception.
  - **Live Verifier:** An endpoint `POST /api/audit/verify` recursively recalculates the full chain from sequence #1 to latest and flags any corrupted sequence.
- **Automated Test Coverage:** [`test_audit_chain_is_initially_valid`](file:///backend/tests/test_audit_integrity.py), [`test_audit_db_triggers_prevent_direct_sql_tampering`](file:///backend/tests/test_audit_integrity.py).

---

### Threat 5: Malicious File Uploads, Polyglots & Path Traversal
- **Severity:** High
- **Adversary Goal:** An attacker uploads a script (`.exe`, `.sh`, `.php`, `.bat`) disguised as a PDF or image, or uses path traversal (`../../etc/passwd`) to overwrite system binaries.
- **Attack Vectors:** Double extensions (`contract.pdf.exe`), MIME-type spoofing, magic byte manipulation, directory traversal in filenames.
- **TrustVault Mitigation:**
  - Strict upload pipeline in [`validator.py`](file:///backend/app/validator.py):
    1. Rejection of forbidden executable extensions (`.exe`, `.bat`, `.sh`, `.php`, `.py`, `.js`, etc.).
    2. Double extension attack prevention.
    3. Filename sanitization via `os.path.basename` and regex stripping.
    4. Magic byte inspection: The binary header must strictly match the declared MIME type (e.g. PDF must start with `%PDF-`, PNG with `\x89PNG\r\n\x1a\n`).
    5. Maximum file size enforced (50 MB limit).
- **Automated Test Coverage:** [`test_executable_extension_rejection`](file:///backend/tests/test_upload_security.py), [`test_double_extension_attack_rejection`](file:///backend/tests/test_upload_security.py), [`test_magic_byte_mismatch_polyglot_rejection`](file:///backend/tests/test_upload_security.py), [`test_path_traversal_filename_sanitization`](file:///backend/tests/test_upload_security.py).

---

### Threat 6: Viewing vs. Downloading Privilege Escalation
- **Severity:** Medium-High
- **Adversary Goal:** A user granted read-only viewing or in-browser preview saves and distributes the raw document file.
- **Attack Vectors:** Forcing browser downloads, calling download API endpoints with a viewer token.
- **TrustVault Mitigation:**
  - Explicit bifurcation: **Viewing** (`GET /api/documents/{id}/preview`) and **Downloading** (`GET /api/documents/{id}/download`) are decoupled.
  - Viewers can preview decrypted content inline in-browser by default.
  - Downloading is strictly blocked (HTTP 403) unless `allow_viewer_download == 1` or the owner explicitly granted `can_download == 1`.
- **Automated Test Coverage:** [`test_8_viewer_cannot_download_document_when_downloading_not_permitted`](file:///backend/tests/test_viewer_and_registration.py).

---

### Threat 7: Public Self-Registration & Privilege Elevation
- **Severity:** High
- **Adversary Goal:** A rogue actor registers an account via public sign-up and injects `role: "admin"` or `role: "owner"` in the request payload.
- **Attack Vectors:** Tampering with registration JSON bodies in Postman or Burp Suite.
- **TrustVault Mitigation:**
  - `POST /api/auth/register` completely ignores any client-supplied role input and unconditionally forces `role = "viewer"`.
  - Password complexity is enforced (8+ chars, upper, lower, number).
  - Updating a user's role (`PUT /api/users/{id}/role`) strictly requires the `admin` role.
- **Automated Test Coverage:** [`test_4_newly_registered_user_receives_default_viewer_role`](file:///backend/tests/test_viewer_and_registration.py), [`test_9_viewer_cannot_promote_themselves_to_administrator`](file:///backend/tests/test_viewer_and_registration.py).

---

### Threat 8: AI Assistant Autonomous Access Widening
- **Severity:** High
- **Adversary Goal:** The AI assistant is manipulated via prompt injection or automated decision-making to autonomously share a confidential document with an unauthorized user.
- **Attack Vectors:** Prompt injection within document contents, automated granting without human confirmation.
- **TrustVault Mitigation:**
  - **Strict Human-in-the-Loop:** The AI assistant in [`ai_assistant.py`](file:///backend/app/ai_assistant.py) can only suggest access grants.
  - The system architecture guarantees that the machine **never widens access autonomously**.
  - A human document owner must explicitly click to confirm a suggestion, and both the AI recommendation and the human confirmation are recorded in the audit trail.

---

### Threat 9: Data at Rest Exposure & Ciphertext Exfiltration
- **Severity:** High
- **Adversary Goal:** A breach of the underlying storage disk allows an attacker to read confidential documents directly from filesystem paths.
- **Attack Vectors:** Compromise of backup archives, filesystem exfiltration, directory browsing.
- **TrustVault Mitigation:**
  - Stored files are **never** written to disk in plaintext.
  - Every upload is encrypted using **AES-256-GCM** authenticated encryption with a unique 96-bit Initialization Vector (IV) and 128-bit authentication tag.
  - Storage paths use opaque UUIDs without identifiable metadata in directory names.

---

## 3. Knowingly Accepted Risks & Design Trade-offs

| Risk | Why It Was Accepted | Production Migration Path |
|---|---|---|
| **Single Master Vault Key** | For simplicity and evaluation, AES-256 keys are derived from an environment master key (`VAULT_MASTER_KEY`). | In a production cloud deployment, migrate to an envelope encryption architecture backed by **AWS KMS** or **HashiCorp Vault**, with per-document Data Encryption Keys (DEKs). |
| **In-Memory Rate Limiting** | Rate limiting is implemented with an in-process thread-safe sliding window. Multiple backend worker processes would not share attempt counters. | In clustered production environments, back rate-limiting buckets with **Redis** (`redis-py` with sliding window Lua scripts). |
| **SQLite Concurrency & Triggers** | SQLite provides zero-dependency deployment and robust SQL triggers for immutable audit logs. Under heavy concurrent writes, database locking occurs. | Migrate to **PostgreSQL** with Row-Level Security (RLS) policies and append-only audit tables with write-once permissions. |
| **Client Screenshot / Screen Recording** | In-browser preview streams decrypted bytes to the user's browser canvas/DOM. A viewer with physical device access can take a screenshot or photograph of their screen. | Accepted industry limitation. Can be augmented with dynamic watermarking (overlaying user email and timestamp on preview canvas) and DRM wrappers. |
