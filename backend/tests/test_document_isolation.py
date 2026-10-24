import io


def test_alice_can_upload_and_read_own_document(client, alice_headers):
    """Document Owner can upload and subsequently read and download their own document."""
    file_content = b"%PDF-1.4\n%Alice Confidential Quarterly Financial Statement\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    files = {
        "file": ("alices_finance_2026.pdf", io.BytesIO(file_content), "application/pdf")
    }
    data = {
        "title": "Alice Q1 Financial Statement",
        "category": "Finance",
        "sensitivity": "Confidential",
    }

    upload_res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert upload_res.status_code == 200, upload_res.text
    doc = upload_res.json()
    doc_id = doc["id"]
    assert doc["title"] == "Alice Q1 Financial Statement"
    assert doc["owner_username"] == "alice_owner"

    # Alice can read metadata
    get_res = client.get(f"/api/documents/{doc_id}", headers=alice_headers)
    assert get_res.status_code == 200

    # Alice can download payload
    dl_res = client.get(f"/api/documents/{doc_id}/download", headers=alice_headers)
    assert dl_res.status_code == 200
    assert dl_res.content == file_content
    assert dl_res.headers["content-type"] == "application/pdf"
    assert "no-store" in dl_res.headers["cache-control"]


def test_cross_user_isolation_bob_cannot_access_alice_document(
    client, alice_headers, bob_headers
):
    """User B (Bob) cannot read metadata or download bytes for User A's (Alice) private document."""
    file_content = b"%PDF-1.4\n%Alice Super Secret Strategy\n%%EOF"
    files = {"file": ("alice_secret.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "title": "Alice Secret Strategy",
        "category": "Strategy",
        "sensitivity": "Restricted",
    }

    upload_res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert upload_res.status_code == 200
    doc_id = upload_res.json()["id"]

    # Bob attempting to read metadata must receive 403 Forbidden
    bob_meta = client.get(f"/api/documents/{doc_id}", headers=bob_headers)
    assert bob_meta.status_code == 403
    assert "Access denied" in bob_meta.json()["detail"]

    # Bob attempting to download document bytes must receive 403 Forbidden
    bob_dl = client.get(f"/api/documents/{doc_id}/download", headers=bob_headers)
    assert bob_dl.status_code == 403
    assert "Access denied" in bob_dl.json()["detail"]


def test_search_isolation_no_data_leakage(client, alice_headers, eve_headers):
    """Search queries never leak private document existence, title, or metadata to unauthorized users."""
    file_content = b"%PDF-1.4\n%Classified Project Pegasus\n%%EOF"
    files = {"file": ("pegasus.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "title": "Project Pegasus Architecture",
        "category": "Classified",
        "sensitivity": "Restricted",
    }

    upload_res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert upload_res.status_code == 200

    # Alice searches for "Pegasus" -> finds it
    alice_search = client.get("/api/documents?search=Pegasus", headers=alice_headers)
    assert alice_search.status_code == 200
    alice_titles = [d["title"] for d in alice_search.json()]
    assert "Project Pegasus Architecture" in alice_titles

    # Eve (unauthorized viewer) searches for "Pegasus" -> 0 results
    eve_search = client.get("/api/documents?search=Pegasus", headers=eve_headers)
    assert eve_search.status_code == 200
    eve_titles = [d["title"] for d in eve_search.json()]
    assert "Project Pegasus Architecture" not in eve_titles


def test_admin_separation_of_duties(client, alice_headers, admin_headers):
    """
    CRITICAL SECURITY INVARIANT:
    Administrators have operational oversight and audit visibility,
    but CANNOT download private document contents without an explicit grant.
    """
    file_content = b"%PDF-1.4\n%Alice Personal Medical Record\n%%EOF"
    files = {"file": ("medical.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "title": "Alice Medical Confidential",
        "category": "Medical",
        "sensitivity": "Restricted",
    }

    upload_res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert upload_res.status_code == 200
    doc_id = upload_res.json()["id"]

    # Admin cannot download private document payload
    admin_dl = client.get(f"/api/documents/{doc_id}/download", headers=admin_headers)
    assert admin_dl.status_code == 403
    assert "Access denied" in admin_dl.json()["detail"]


def test_immediate_enforcement_of_revoked_permissions(
    client, alice_headers, charlie_headers
):
    """
    IMMEDIATE REVOCATION ENFORCEMENT:
    When an owner grants permission, user can access.
    The exact millisecond the owner revokes permission, the next request is immediately blocked (403).
    """
    file_content = b"%PDF-1.4\n%Shared Patent Submission Draft\n%%EOF"
    files = {"file": ("patent_draft.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "title": "Patent Submission Draft",
        "category": "Legal",
        "sensitivity": "Confidential",
    }

    upload_res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert upload_res.status_code == 200
    doc_id = upload_res.json()["id"]

    # 1. Charlie initially has NO access
    pre_grant_res = client.get(
        f"/api/documents/{doc_id}/download", headers=charlie_headers
    )
    assert pre_grant_res.status_code == 403

    # 2. Alice grants 'read' access to charlie_viewer
    grant_res = client.post(
        f"/api/documents/{doc_id}/permissions",
        headers=alice_headers,
        json={"target_username_or_id": "charlie_viewer", "permission_level": "read"},
    )
    assert grant_res.status_code == 200
    charlie_id = grant_res.json()["target_user_id"]

    # 3. Charlie can now immediately download the document
    during_grant_res = client.get(
        f"/api/documents/{doc_id}/download", headers=charlie_headers
    )
    assert during_grant_res.status_code == 200
    assert during_grant_res.content == file_content

    # 4. Alice revokes Charlie's access
    revoke_res = client.delete(
        f"/api/documents/{doc_id}/permissions/{charlie_id}", headers=alice_headers
    )
    assert revoke_res.status_code == 200

    # 5. IMMEDIATELY: Charlie's next request is rejected with 403 Forbidden
    post_revoke_res = client.get(
        f"/api/documents/{doc_id}/download", headers=charlie_headers
    )
    assert post_revoke_res.status_code == 403
    assert "Access denied" in post_revoke_res.json()["detail"]


def test_editor_cannot_delete_or_grant_permissions(
    client, alice_headers, charlie_headers, bob_headers
):
    """
    Least privilege enforcement:
    A user with an 'edit' grant can edit document content/metadata,
    but CANNOT delete the document or grant permissions to third parties.
    """
    file_content = b"%PDF-1.4\n%Collaborative Project Brief\n%%EOF"
    files = {"file": ("brief.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "title": "Collaborative Project Brief",
        "category": "Projects",
        "sensitivity": "Internal",
    }

    upload_res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert upload_res.status_code == 200
    doc_id = upload_res.json()["id"]

    # Alice grants Charlie 'edit' permission
    client.post(
        f"/api/documents/{doc_id}/permissions",
        headers=alice_headers,
        json={"target_username_or_id": "charlie_viewer", "permission_level": "edit"},
    )

    # Charlie can edit metadata
    update_res = client.put(
        f"/api/documents/{doc_id}",
        headers=charlie_headers,
        json={"title": "Collaborative Project Brief - Revised by Charlie"},
    )
    assert update_res.status_code == 200
    assert (
        update_res.json()["title"] == "Collaborative Project Brief - Revised by Charlie"
    )

    # Charlie CANNOT grant permissions to Bob
    charlie_grant = client.post(
        f"/api/documents/{doc_id}/permissions",
        headers=charlie_headers,
        json={"target_username_or_id": "bob_owner", "permission_level": "read"},
    )
    assert charlie_grant.status_code == 403
    assert "strictly restricted to the document owner" in charlie_grant.json()["detail"]

    # Charlie CANNOT delete the document
    charlie_del = client.delete(f"/api/documents/{doc_id}", headers=charlie_headers)
    assert charlie_del.status_code == 403
    assert "strictly restricted to the document owner" in charlie_del.json()["detail"]
