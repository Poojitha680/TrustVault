import io
from fastapi.testclient import TestClient


def test_viewer_cannot_upload_document(client: TestClient, charlie_headers):
    """Viewers cannot upload documents; must receive 403 Forbidden."""
    file_content = b"%PDF-1.4\n%Viewer attempted upload\n%%EOF"
    files = {"file": ("unauthorized.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "title": "Unauthorized Document",
        "category": "General",
        "sensitivity": "Internal",
    }
    res = client.post("/api/documents/upload", headers=charlie_headers, files=files, data=data)
    assert res.status_code == 403
    assert "restricted" in res.json()["detail"].lower()


def test_non_admin_cannot_create_user(client: TestClient, alice_headers):
    """Non-admin (even a document owner) cannot create users."""
    res = client.post(
        "/api/users",
        headers=alice_headers,
        json={
            "username": "new_user_attempt",
            "email": "new_user@test.org",
            "full_name": "New User",
            "role": "viewer",
            "password": "Password123!",
        },
    )
    assert res.status_code == 403
    assert "administrator" in res.json()["detail"].lower()


def test_admin_can_create_user_and_toggle_status(client: TestClient, admin_headers):
    """Admin can provision a new user and toggle their active status."""
    username = "test_provisioned_user"
    email = "provisioned@test.internal"
    res = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "username": username,
            "email": email,
            "full_name": "Provisioned User",
            "role": "viewer",
            "password": "TempPassword123!",
        },
    )
    assert res.status_code == 200
    user_id = res.json()["id"]

    # Toggle to deactivated
    toggle_res = client.put(f"/api/users/{user_id}/status", headers=admin_headers)
    assert toggle_res.status_code == 200
    assert toggle_res.json()["is_active"] is False

    # Deactivated user cannot log in
    login_res = client.post(
        "/api/auth/login",
        json={"username": username, "password": "TempPassword123!"},
    )
    assert login_res.status_code in (401, 403)

    # Reactivate user
    reactivate_res = client.put(f"/api/users/{user_id}/status", headers=admin_headers)
    assert reactivate_res.status_code == 200
    assert reactivate_res.json()["is_active"] is True

    # Now login succeeds
    login_success = client.post(
        "/api/auth/login",
        json={"username": username, "password": "TempPassword123!"},
    )
    assert login_success.status_code == 200


def test_cannot_deactivate_own_admin_account(client: TestClient, admin_headers):
    """Admin cannot deactivate their own active account."""
    me_res = client.get("/api/auth/me", headers=admin_headers)
    assert me_res.status_code == 200
    my_id = me_res.json()["id"]

    res = client.put(f"/api/users/{my_id}/status", headers=admin_headers)
    assert res.status_code == 400
    assert "cannot deactivate" in res.json()["detail"].lower()


def test_non_owner_cannot_manage_permissions(client: TestClient, charlie_headers, bob_headers):
    """Non-owners cannot grant or revoke document permissions."""
    # Find Bob's document
    bob_docs = client.get("/api/documents", headers=bob_headers).json()
    bob_doc = next(d for d in bob_docs if d["owner_username"] == "bob_owner")
    doc_id = bob_doc["id"]

    # Charlie (viewer) attempts to grant access to Eve
    res = client.post(
        f"/api/documents/{doc_id}/permissions",
        headers=charlie_headers,
        json={"target_username_or_id": "eve_attacker", "permission_level": "read"},
    )
    assert res.status_code == 403
