from datetime import UTC, datetime

from backend.app.audit import record_audit_event, verify_audit_integrity
from backend.app.database import get_db, init_db
from backend.app.security import compute_sha256, hash_password
from backend.app.storage import VaultStorageManager


def seed_database():
    """Seeds the database with test personas, confidential files, permissions, and audit logs."""
    init_db()
    now_iso = datetime.now(UTC).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()

        # Check if already seeded
        cursor.execute("SELECT COUNT(*) as count FROM users")
        if cursor.fetchone()["count"] > 0:
            print("Database already seeded.")
            return

        print("Seeding TrustVault users...")
        users_data = [
            (
                "admin",
                "admin@trustvault.internal",
                "Platform Administrator",
                "admin",
                hash_password("AdminPassword123!"),
            ),
            (
                "alice_owner",
                "alice@trustvault.internal",
                "Alice Walker (Finance Director)",
                "owner",
                hash_password("OwnerPassword123!"),
            ),
            (
                "bob_owner",
                "bob@trustvault.internal",
                "Bob Miller (Lead Engineer)",
                "owner",
                hash_password("OwnerPassword123!"),
            ),
            (
                "charlie_viewer",
                "charlie@trustvault.internal",
                "Charlie Vance (Auditor & Legal)",
                "viewer",
                hash_password("ViewerPassword123!"),
            ),
            (
                "eve_attacker",
                "eve@external.org",
                "Eve Sterling (Unauthorized Outlier)",
                "viewer",
                hash_password("AttackerPassword123!"),
            ),
        ]

        cursor.executemany(
            """
            INSERT INTO users (username, email, full_name, role, password_hash, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        """,
            [(u[0], u[1], u[2], u[3], u[4], now_iso) for u in users_data],
        )

        # Fetch created user IDs
        cursor.execute("SELECT id, username FROM users")
        user_map = {row["username"]: row["id"] for row in cursor.fetchall()}

    # Record initial system startup in audit
    record_audit_event(
        action="SYSTEM_INIT",
        status="SUCCESS",
        user_id=user_map["admin"],
        username="admin",
        details="TrustVault cryptographic vault initialized and verified.",
    )

    # Prepare and store sample confidential documents
    docs_to_seed = [
        {
            "title": "Q3 Executive Salary Letters & Compensation Review.pdf",
            "filename": "Q3_Executive_Salaries_2026.pdf",
            "category": "Salaries",
            "sensitivity": "Restricted",
            "owner": "alice_owner",
            "content": b"%PDF-1.4\n%TrustVault Confidential Executive Payroll\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF",
            "mime": "application/pdf",
        },
        {
            "title": "Master Enterprise Services Agreement - Acme Corp.docx",
            "filename": "Enterprise_Services_Agreement_Acme.docx",
            "category": "Contracts",
            "sensitivity": "Confidential",
            "owner": "alice_owner",
            "content": b"PK\x03\x04\x14\x00\x00\x00\x08\x00TrustVault Confidential Contract Terms and SLA Schedules",
            "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        {
            "title": "Patented Aerodynamic Turbine Blueprint v4.2.pdf",
            "filename": "Turbine_Blueprint_v4_2.pdf",
            "category": "Engineering",
            "sensitivity": "Confidential",
            "owner": "bob_owner",
            "content": b"%PDF-1.4\n%Proprietary Turbine Schematics\n1 0 obj\n<< /Title (Turbine Blueprint) >>\nendobj\n%%EOF",
            "mime": "application/pdf",
        },
        {
            "title": "Annual Statutory Compliance & Regulatory Audit Report.pdf",
            "filename": "Compliance_Audit_Report_2026.pdf",
            "category": "Audits",
            "sensitivity": "Internal",
            "owner": "bob_owner",
            "content": b"%PDF-1.4\n%Regulatory Audit Findings\n1 0 obj\n<< /Subject (Compliance) >>\nendobj\n%%EOF",
            "mime": "application/pdf",
        },
    ]

    doc_ids = {}
    for d in docs_to_seed:
        file_uuid, storage_path, file_size = VaultStorageManager.store_file(
            d["content"]
        )
        sha256 = compute_sha256(d["content"])
        owner_id = user_map[d["owner"]]

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
                    d["title"],
                    d["filename"],
                    storage_path,
                    file_size,
                    d["mime"],
                    sha256,
                    d["category"],
                    d["sensitivity"],
                    owner_id,
                    now_iso,
                    now_iso,
                ),
            )
            doc_id = cursor.lastrowid
            doc_ids[d["title"]] = doc_id

        record_audit_event(
            action="DOC_UPLOAD",
            status="SUCCESS",
            user_id=owner_id,
            username=d["owner"],
            document_id=doc_id,
            document_title=d["title"],
            details=f"Document uploaded and encrypted under AES-256-GCM. SHA256={sha256[:12]}...",
        )

    # Seed explicit named permissions
    # 1. Charlie (Viewer) is granted READ on "Master Enterprise Services Agreement"
    doc_contract_id = doc_ids["Master Enterprise Services Agreement - Acme Corp.docx"]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO document_permissions (document_id, user_id, permission_level, granted_by, granted_at)
            VALUES (?, ?, 'read', ?, ?)
        """,
            (
                doc_contract_id,
                user_map["charlie_viewer"],
                user_map["alice_owner"],
                now_iso,
            ),
        )

    record_audit_event(
        action="PERMISSION_GRANTED",
        status="SUCCESS",
        user_id=user_map["alice_owner"],
        username="alice_owner",
        document_id=doc_contract_id,
        document_title="Master Enterprise Services Agreement - Acme Corp.docx",
        details="Owner alice_owner granted 'read' permission to charlie_viewer",
    )

    # 2. Charlie (Viewer) is granted EDIT on "Annual Statutory Compliance Report"
    doc_audit_id = doc_ids["Annual Statutory Compliance & Regulatory Audit Report.pdf"]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO document_permissions (document_id, user_id, permission_level, granted_by, granted_at)
            VALUES (?, ?, 'edit', ?, ?)
        """,
            (doc_audit_id, user_map["charlie_viewer"], user_map["bob_owner"], now_iso),
        )

    record_audit_event(
        action="PERMISSION_GRANTED",
        status="SUCCESS",
        user_id=user_map["bob_owner"],
        username="bob_owner",
        document_id=doc_audit_id,
        document_title="Annual Statutory Compliance & Regulatory Audit Report.pdf",
        details="Owner bob_owner granted 'edit' permission to charlie_viewer",
    )

    # Verify audit integrity after seeding
    verification = verify_audit_integrity()
    print("Seed verification complete:", verification)


if __name__ == "__main__":
    seed_database()
