import sqlite3

import pytest

from backend.app.database import get_db


def test_audit_chain_is_initially_valid(client, admin_headers):
    """Verifies that the HMAC-SHA256 audit log hash chain validates with 100% integrity."""
    res = client.get("/api/audit/verify", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["total_records"] > 0
    assert "zero discrepancies" in data["message"]


def test_security_events_recorded_on_refused_probes(
    client, alice_headers, eve_headers, admin_headers
):
    """Every unauthorized access attempt is synchronously appended to the tamper-evident audit trail."""
    # Alice has documents; Eve attempts an IDOR probe on doc 1
    res = client.get("/api/documents/1/download", headers=eve_headers)
    assert res.status_code == 403

    # Admin checks security alerts endpoint
    alerts_res = client.get("/api/audit/alerts", headers=admin_headers)
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    assert len(alerts) > 0
    assert any(
        a["status"] == "REFUSED" and a["username"] == "eve_attacker" for a in alerts
    )


def test_audit_db_triggers_prevent_direct_sql_tampering():
    """
    IMMUTABLE AUDIT LOG INVARIANT:
    Database triggers strictly abort any direct SQL UPDATE or DELETE on the audit_logs table.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM audit_logs LIMIT 1")
        row = cursor.fetchone()
        log_id = row["id"]

        # Attempting UPDATE must raise SQLite abort trigger
        with pytest.raises(sqlite3.DatabaseError) as excinfo:
            cursor.execute(
                "UPDATE audit_logs SET details = 'HACKED DETAILS' WHERE id = ?",
                (log_id,),
            )
        assert (
            "SECURITY VIOLATION: Audit log records are cryptographically immutable"
            in str(excinfo.value)
        )

        # Attempting DELETE must raise SQLite abort trigger
        with pytest.raises(sqlite3.DatabaseError) as excinfo_del:
            cursor.execute("DELETE FROM audit_logs WHERE id = ?", (log_id,))
        assert (
            "SECURITY VIOLATION: Audit log records are cryptographically immutable"
            in str(excinfo_del.value)
        )


def test_global_audit_log_restricted_to_admin(client, alice_headers, charlie_headers):
    """Non-administrators are blocked from viewing the global organization audit trail."""
    res_charlie = client.get("/api/audit", headers=charlie_headers)
    assert res_charlie.status_code == 403

    res_alice = client.get("/api/audit", headers=alice_headers)
    assert res_alice.status_code == 403
