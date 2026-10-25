import io
import pytest
from backend.app.database import get_db
from backend.app.security import verify_password


def test_1_new_user_can_register_successfully(client):
    """Requirement 1: A new user can register successfully."""
    payload = {
        "full_name": "Diana Prince",
        "email": "diana.prince@trustvault.internal",
        "username": "diana_viewer",
        "password": "SecurePassword123!",
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data
    assert data["user"]["username"] == "diana_viewer"
    assert data["user"]["email"] == "diana.prince@trustvault.internal"
    assert data["user"]["full_name"] == "Diana Prince"
    assert data["user"]["role"] == "viewer"
    assert data["user"]["is_active"] is True


def test_2_duplicate_email_registration_rejected(client):
    """Requirement 2: Duplicate email registration is rejected."""
    payload = {
        "full_name": "Diana Duplicate",
        "email": "diana.prince@trustvault.internal",
        "username": "diana_other",
        "password": "SecurePassword123!",
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 400
    assert "email" in res.json()["detail"].lower()


def test_3_passwords_are_stored_as_secure_hashes():
    """Requirement 3: Passwords are stored as secure hashes (Argon2id, never plaintext)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE username = 'diana_viewer'")
        row = cursor.fetchone()
        assert row is not None
        pwd_hash = row["password_hash"]
        # Argon2 hashes start with $argon2id$
        assert pwd_hash.startswith("$argon2id$")
        assert "SecurePassword123!" not in pwd_hash
        assert verify_password("SecurePassword123!", pwd_hash) is True
        assert verify_password("WrongPassword!", pwd_hash) is False


def test_4_newly_registered_user_receives_default_viewer_role(client):
    """
    Requirement 4: A newly registered user receives the default viewer role.
    Even if client maliciously attempts to submit role='admin', it is blocked/ignored.
    """
    payload = {
        "full_name": "Edward Attacker",
        "email": "edward@attack.org",
        "username": "edward_sneak",
        "password": "EdwardPassword123!",
        "role": "admin",  # Malicious self-assigned role attempt
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 200
    user_data = res.json()["user"]
    assert user_data["role"] == "viewer"  # Strictly defaulted to viewer


def test_5_viewer_can_login_and_access_authorized_documents(client, alice_headers):
    """Requirement 5: A viewer can log in and access authorized documents."""
    # 1. Log in with newly created viewer credentials
    login_res = client.post(
        "/api/auth/login",
        json={"username": "diana_viewer", "password": "SecurePassword123!"},
    )
    assert login_res.status_code == 200
    diana_token = login_res.json()["access_token"]
    diana_headers = {"Authorization": f"Bearer {diana_token}"}

    # 2. Diana has no documents initially
    docs_res = client.get("/api/documents", headers=diana_headers)
    assert docs_res.status_code == 200
    assert len(docs_res.json()) == 0

    # 3. Alice uploads a document and shares read access with Diana
    file_content = b"%PDF-1.4\n%Authorized Viewer Document\n%%EOF"
    upload_res = client.post(
        "/api/documents/upload",
        headers=alice_headers,
        files={"file": ("authorized_doc.pdf", io.BytesIO(file_content), "application/pdf")},
        data={"title": "Authorized Viewer Document", "category": "Legal", "sensitivity": "Internal"},
    )
    assert upload_res.status_code == 200
    doc_id = upload_res.json()["id"]

    grant_res = client.post(
        f"/api/documents/{doc_id}/permissions",
        headers=alice_headers,
        json={"target_username_or_id": "diana_viewer", "permission_level": "read", "can_download": False},
    )
    assert grant_res.status_code == 200

    # 4. Diana can now see this authorized document in list and inspect metadata
    diana_docs = client.get("/api/documents", headers=diana_headers)
    assert diana_docs.status_code == 200
    assert any(d["id"] == doc_id for d in diana_docs.json())

    # 5. Diana can access document preview
    preview_res = client.get(f"/api/documents/{doc_id}/preview", headers=diana_headers)
    assert preview_res.status_code == 200
    assert preview_res.content == file_content


def test_6_viewer_cannot_upload_edit_rename_delete_or_share(client):
    """
    Requirement 6: A viewer cannot upload, edit, rename, delete, or share documents.
    All operations must return HTTP 403 Forbidden.
    """
    login_res = client.post(
        "/api/auth/login",
        json={"username": "diana_viewer", "password": "SecurePassword123!"},
    )
    diana_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Upload attempt
    file_content = b"%PDF-1.4\n%Hacked Upload\n%%EOF"
    up_res = client.post(
        "/api/documents/upload",
        headers=diana_headers,
        files={"file": ("hacked.pdf", io.BytesIO(file_content), "application/pdf")},
        data={"title": "Hacked Document", "category": "General", "sensitivity": "Confidential"},
    )
    assert up_res.status_code == 403
    assert "restricted" in up_res.json()["detail"].lower()

    # Edit metadata / rename attempt on document 1
    edit_res = client.put(
        "/api/documents/1",
        headers=diana_headers,
        json={"title": "Renamed by Viewer"},
    )
    assert edit_res.status_code == 403

    # Edit content attempt
    content_res = client.put(
        "/api/documents/1/content",
        headers=diana_headers,
        files={"file": ("revised.pdf", io.BytesIO(file_content), "application/pdf")},
    )
    assert content_res.status_code == 403

    # Delete attempt
    del_res = client.delete("/api/documents/1", headers=diana_headers)
    assert del_res.status_code == 403

    # Share / grant permission attempt
    share_res = client.post(
        "/api/documents/1/permissions",
        headers=diana_headers,
        json={"target_username_or_id": "bob_owner", "permission_level": "read"},
    )
    assert share_res.status_code == 403


def test_7_viewer_cannot_access_another_users_private_documents(client):
    """Requirement 7: A viewer cannot access another user's private documents."""
    login_res = client.post(
        "/api/auth/login",
        json={"username": "diana_viewer", "password": "SecurePassword123!"},
    )
    diana_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Document 1 belongs to Alice and has NOT been shared with Diana
    get_res = client.get("/api/documents/1", headers=diana_headers)
    assert get_res.status_code == 403

    preview_res = client.get("/api/documents/1/preview", headers=diana_headers)
    assert preview_res.status_code == 403

    dl_res = client.get("/api/documents/1/download", headers=diana_headers)
    assert dl_res.status_code == 403


def test_8_viewer_cannot_download_document_when_downloading_not_permitted(client, alice_headers):
    """
    Requirement 8: A viewer cannot download a document when downloading is not permitted.
    Distinction: preview is permitted, but download returns 403.
    """
    # Alice uploads document with default allow_viewer_download=0
    file_content = b"%PDF-1.4\n%Preview Only Doc\n%%EOF"
    upload_res = client.post(
        "/api/documents/upload",
        headers=alice_headers,
        files={"file": ("preview_only.pdf", io.BytesIO(file_content), "application/pdf")},
        data={"title": "Preview Only Confidential Doc", "category": "Legal", "sensitivity": "Confidential"},
    )
    assert upload_res.status_code == 200
    doc_id = upload_res.json()["id"]

    # Alice grants Diana read access with can_download=False
    grant_res = client.post(
        f"/api/documents/{doc_id}/permissions",
        headers=alice_headers,
        json={"target_username_or_id": "diana_viewer", "permission_level": "read", "can_download": False},
    )
    assert grant_res.status_code == 200

    login_res = client.post(
        "/api/auth/login",
        json={"username": "diana_viewer", "password": "SecurePassword123!"},
    )
    diana_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Preview MUST succeed
    preview_res = client.get(f"/api/documents/{doc_id}/preview", headers=diana_headers)
    assert preview_res.status_code == 200

    # Download MUST be refused with 403
    download_res = client.get(f"/api/documents/{doc_id}/download", headers=diana_headers)
    assert download_res.status_code == 403
    assert "downloading is not permitted" in download_res.json()["detail"].lower()

    # When Alice updates grant to permit download:
    client.post(
        f"/api/documents/{doc_id}/permissions",
        headers=alice_headers,
        json={"target_username_or_id": "diana_viewer", "permission_level": "read", "can_download": True},
    )
    # Download now succeeds
    dl_allowed = client.get(f"/api/documents/{doc_id}/download", headers=diana_headers)
    assert dl_allowed.status_code == 200
    assert dl_allowed.content == file_content


def test_9_viewer_cannot_promote_themselves_to_administrator(client):
    """
    Requirement 9: A viewer cannot promote themselves to administrator.
    Direct API calls to modify role return HTTP 403 Forbidden.
    """
    login_res = client.post(
        "/api/auth/login",
        json={"username": "diana_viewer", "password": "SecurePassword123!"},
    )
    diana_id = login_res.json()["user"]["id"]
    diana_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Attempt to change role via PUT /api/users/{id}/role
    role_res = client.put(
        f"/api/users/{diana_id}/role",
        headers=diana_headers,
        json={"role": "admin"},
    )
    assert role_res.status_code == 403

    # Verify role in DB remains viewer
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT role FROM users WHERE id = ?", (diana_id,))
        row = cursor.fetchone()
        assert row["role"] == "viewer"


def test_10_direct_api_requests_cannot_bypass_viewer_restrictions(client):
    """
    Requirement 10: Direct API requests cannot bypass viewer restrictions.
    Checking admin metrics, creating users, toggling status, or verifying audit logs.
    """
    login_res = client.post(
        "/api/auth/login",
        json={"username": "diana_viewer", "password": "SecurePassword123!"},
    )
    diana_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Attempt to access admin metrics
    assert client.get("/api/admin/metrics", headers=diana_headers).status_code == 403

    # Attempt to create user
    assert client.post(
        "/api/users",
        headers=diana_headers,
        json={"username": "fake_admin", "email": "fake@test.com", "full_name": "Fake", "role": "admin", "password": "Password123!"},
    ).status_code == 403

    # Attempt to toggle user status
    assert client.put("/api/users/1/status", headers=diana_headers).status_code == 403

    # Attempt to access global audit log
    assert client.get("/api/audit", headers=diana_headers).status_code == 403

    # Attempt to verify audit chain
    assert client.get("/api/audit/verify", headers=diana_headers).status_code == 403


def test_11_administrators_retain_authorized_management_capabilities(client, admin_headers):
    """Requirement 11: Administrators retain their authorized management capabilities."""
    metrics_res = client.get("/api/admin/metrics", headers=admin_headers)
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()
    assert "total_users" in metrics
    assert "active_documents" in metrics

    users_res = client.get("/api/users", headers=admin_headers)
    assert users_res.status_code == 200
    assert len(users_res.json()) >= 4

    verify_res = client.get("/api/audit/verify", headers=admin_headers)
    assert verify_res.status_code == 200
    assert verify_res.json()["valid"] is True


def test_12_existing_user_accounts_and_documents_remain_intact(client, alice_headers, bob_headers, admin_headers):
    """Requirement 12: Existing user accounts and documents remain intact."""
    # Alice (Finance Director) can log in and access her documents
    alice_docs = client.get("/api/documents", headers=alice_headers)
    assert alice_docs.status_code == 200

    # Bob (Lead Engineer) can log in and access his documents
    bob_docs = client.get("/api/documents", headers=bob_headers)
    assert bob_docs.status_code == 200

    # Admin can inspect system users
    users = client.get("/api/users", headers=admin_headers).json()
    usernames = [u["username"] for u in users]
    assert "admin" in usernames
    assert "alice_owner" in usernames
    assert "bob_owner" in usernames
    assert "charlie_viewer" in usernames
