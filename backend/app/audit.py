import hashlib
import hmac
from datetime import UTC, datetime
from typing import Any

from backend.app.config import AUDIT_HMAC_KEY
from backend.app.database import get_db

GENESIS_PREVIOUS_HASH = (
    "0000000000000000000000000000000000000000000000000000000000000000"
)


def _compute_entry_hash(
    sequence_number: int,
    timestamp: str,
    user_id: int | None,
    username: str,
    action: str,
    document_id: int | None,
    status: str,
    details: str,
    previous_hash: str,
) -> str:
    """
    Computes an HMAC-SHA256 digest over the canonical representation of an audit record.
    The presence of previous_hash creates an unbroken cryptographic chain.
    """
    canonical_payload = (
        f"{sequence_number}|{timestamp}|{user_id or 'NULL'}|{username}|"
        f"{action}|{document_id or 'NULL'}|{status}|{previous_hash}|{details or ''}"
    )
    return hmac.new(
        AUDIT_HMAC_KEY, canonical_payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def record_audit_event(
    action: str,
    status: str = "SUCCESS",  # "SUCCESS", "REFUSED", "SECURITY_ALERT"
    user_id: int | None = None,
    username: str = "anonymous",
    document_id: int | None = None,
    document_title: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: str | None = None,
) -> dict[str, Any]:
    """
    Synchronously appends a new audit event to the tamper-evident cryptographic hash chain.
    Ensures monotonic sequence ordering and integrity chaining.
    """
    timestamp = datetime.now(UTC).isoformat()
    clean_details = (details or "").strip()

    with get_db() as conn:
        cursor = conn.cursor()

        # Fetch the most recent audit entry to continue the cryptographic chain
        cursor.execute("""
            SELECT sequence_number, entry_hash
            FROM audit_logs
            ORDER BY sequence_number DESC
            LIMIT 1
        """)
        last_entry = cursor.fetchone()

        if last_entry:
            sequence_number = last_entry["sequence_number"] + 1
            previous_hash = last_entry["entry_hash"]
        else:
            sequence_number = 1
            previous_hash = GENESIS_PREVIOUS_HASH

        entry_hash = _compute_entry_hash(
            sequence_number=sequence_number,
            timestamp=timestamp,
            user_id=user_id,
            username=username,
            action=action,
            document_id=document_id,
            status=status,
            details=clean_details,
            previous_hash=previous_hash,
        )

        cursor.execute(
            """
            INSERT INTO audit_logs (
                sequence_number, timestamp, user_id, username, action,
                document_id, document_title, status, ip_address, user_agent,
                details, previous_hash, entry_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                sequence_number,
                timestamp,
                user_id,
                username,
                action,
                document_id,
                document_title,
                status,
                ip_address,
                user_agent,
                clean_details,
                previous_hash,
                entry_hash,
            ),
        )

        return {
            "sequence_number": sequence_number,
            "timestamp": timestamp,
            "action": action,
            "status": status,
            "entry_hash": entry_hash,
            "previous_hash": previous_hash,
        }


def verify_audit_integrity() -> dict[str, Any]:
    """
    Validates the entire audit log hash chain from inception.
    Detects any modification, insertion, deletion, or truncation.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, sequence_number, timestamp, user_id, username,
                   action, document_id, document_title, status,
                   details, previous_hash, entry_hash
            FROM audit_logs
            ORDER BY sequence_number ASC
        """)
        rows = cursor.fetchall()

    if not rows:
        return {
            "valid": True,
            "total_records": 0,
            "message": "Audit log is empty. Integrity verified (genesis state).",
            "last_verified_sequence": 0,
        }

    expected_previous_hash = GENESIS_PREVIOUS_HASH
    for expected_seq, row in enumerate(rows, start=1):
        actual_seq = row["sequence_number"]

        # Check 1: Strict monotonic sequencing (detects deletions or reorderings)
        if actual_seq != expected_seq:
            return {
                "valid": False,
                "total_records": len(rows),
                "corrupted_sequence": actual_seq,
                "reason": f"Sequence discontinuity detected. Expected sequence {expected_seq}, found {actual_seq}.",
            }

        # Check 2: Chaining link (detects retro-fitted records)
        if not hmac.compare_digest(row["previous_hash"], expected_previous_hash):
            return {
                "valid": False,
                "total_records": len(rows),
                "corrupted_sequence": actual_seq,
                "reason": (
                    f"Cryptographic chain broken at sequence {actual_seq}. "
                    f"Previous hash does not match prior record's entry hash."
                ),
            }

        # Check 3: HMAC recalculation (detects unauthorized record modification)
        computed_hash = _compute_entry_hash(
            sequence_number=actual_seq,
            timestamp=row["timestamp"],
            user_id=row["user_id"],
            username=row["username"],
            action=row["action"],
            document_id=row["document_id"],
            status=row["status"],
            details=row["details"] or "",
            previous_hash=row["previous_hash"],
        )

        if not hmac.compare_digest(row["entry_hash"], computed_hash):
            return {
                "valid": False,
                "total_records": len(rows),
                "corrupted_sequence": actual_seq,
                "reason": (
                    f"Tampered record at sequence {actual_seq}. "
                    f"HMAC digest verification failed against stored entry_hash."
                ),
            }

        expected_previous_hash = row["entry_hash"]

    return {
        "valid": True,
        "total_records": len(rows),
        "message": f"All {len(rows)} audit log records cryptographically verified with zero discrepancies.",
        "last_verified_sequence": rows[-1]["sequence_number"],
        "latest_chain_hash": rows[-1]["entry_hash"],
    }


def get_audit_trail(
    document_id: int | None = None,
    user_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Retrieves audit trail with optional filtering by document or user."""
    query = """
        SELECT id, sequence_number, timestamp, user_id, username, action,
               document_id, document_title, status, ip_address, user_agent,
               details, previous_hash, entry_hash
        FROM audit_logs
    """
    conditions = []
    params: list[Any] = []

    if document_id is not None:
        conditions.append("document_id = ?")
        params.append(document_id)

    if user_id is not None:
        conditions.append("user_id = ?")
        params.append(user_id)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY sequence_number DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        return [dict(r) for r in cursor.fetchall()]
