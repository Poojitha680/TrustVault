import io


def test_executable_extension_rejection(client, alice_headers):
    """Rejects forbidden executable extensions (.exe, .sh, .bat, .py)."""
    files = {
        "file": (
            "malware.exe",
            io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00"),
            "application/octet-stream",
        )
    }
    data = {"title": "Malware Attempt", "category": "General"}

    res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert res.status_code == 400
    assert (
        "Dangerous executable extension" in res.json()["detail"]
        or "not permitted" in res.json()["detail"]
    )


def test_double_extension_attack_rejection(client, alice_headers):
    """Detects and rejects double-extension attacks designed to fool extension checks (e.g. secret.pdf.exe)."""
    files = {
        "file": (
            "secret.pdf.exe",
            io.BytesIO(b"%PDF-1.4\nMalicious Wrapper"),
            "application/x-msdownload",
        )
    }
    data = {"title": "Double Extension Exploit", "category": "General"}

    res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert res.status_code == 400
    assert "Dangerous executable extension" in res.json()["detail"]


def test_magic_byte_mismatch_polyglot_rejection(client, alice_headers):
    """Rejects spoofed MIME types when file magic bytes do not match declared extension."""
    # Claimed as .pdf but content is arbitrary plain text without %PDF header
    fake_pdf = b"Hello, I am actually a plain text file pretending to be a PDF."
    files = {"file": ("fake_document.pdf", io.BytesIO(fake_pdf), "application/pdf")}
    data = {"title": "Spoofed PDF", "category": "General"}

    res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert res.status_code == 400
    assert "Content does not match a valid PDF file signature" in res.json()["detail"]


def test_path_traversal_filename_sanitization(client, alice_headers):
    """Ensures directory traversal sequences (../../) are stripped and sanitized."""
    valid_pdf = b"%PDF-1.4\n%Traversal test document\n%%EOF"
    files = {
        "file": ("../../../../etc/passwd.pdf", io.BytesIO(valid_pdf), "application/pdf")
    }
    data = {"title": "Path Traversal Probe", "category": "General"}

    res = client.post(
        "/api/documents/upload", headers=alice_headers, files=files, data=data
    )
    assert res.status_code == 200
    clean_name = res.json()["filename"]
    assert ".." not in clean_name
    assert "/" not in clean_name
    assert "\\" not in clean_name
    assert clean_name.endswith(".pdf")


def test_viewer_role_cannot_upload_documents(client, charlie_headers):
    """Users with only Viewer global role are denied document upload capability."""
    valid_pdf = b"%PDF-1.4\n%Viewer attempted upload\n%%EOF"
    files = {"file": ("viewer_upload.pdf", io.BytesIO(valid_pdf), "application/pdf")}
    data = {"title": "Unauthorized Viewer Upload", "category": "General"}

    res = client.post(
        "/api/documents/upload", headers=charlie_headers, files=files, data=data
    )
    assert res.status_code == 403
    assert "restricted to document owners and administrators" in res.json()["detail"]
