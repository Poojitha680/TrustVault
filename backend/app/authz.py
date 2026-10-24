from typing import Any, Literal

from fastapi import HTTPException, status

from backend.app.audit import record_audit_event
from backend.app.database import get_db

PermissionAction = Literal["read", "edit", "delete", "manage_permissions"]


def check_document_access(
    user: dict[str, Any],
    document_id: int,
    required_action: PermissionAction,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """
    CRITICAL SECURITY ENFORCEMENT POINT.
    The server decides, every time, directly against the source of truth database.
    If access is denied, synchronously appends a REFUSED audit event to the hash chain
    and raises an HTTP 403 Forbidden.
    """
    user_id = user["id"]
    username = user["username"]
    role = user.get("role", "viewer")

    with get_db() as conn:
        cursor = conn.cursor()

        # Step 1: Verify document exists and is active
        cursor.execute(
            """
            SELECT id, uuid, title, filename, storage_path, file_size,
                   mime_type, sha256_hash, category, sensitivity,
                   owner_id, is_deleted, created_at, updated_at
            FROM documents
            WHERE id = ?
        """,
            (document_id,),
        )
        doc = cursor.fetchone()

        if not doc or doc["is_deleted"]:
            # Log suspicious probe for nonexistent/deleted documents
            record_audit_event(
                action=f"DOC_{required_action.upper()}_PROBE_NOT_FOUND",
                status="REFUSED",
                user_id=user_id,
                username=username,
                document_id=document_id,
                ip_address=ip_address,
                user_agent=user_agent,
                details=f"User probed non-existent or deleted document ID {document_id}",
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
            )

        doc_dict = dict(doc)
        owner_id = doc_dict["owner_id"]
        doc_title = doc_dict["title"]

        # Step 2: Document Owner has full authority
        if owner_id == user_id:
            return doc_dict

        # Step 3: Check named direct grants in document_permissions
        cursor.execute(
            """
            SELECT permission_level, granted_by, granted_at
            FROM document_permissions
            WHERE document_id = ? AND user_id = ?
        """,
            (document_id, user_id),
        )
        grant = cursor.fetchone()

        has_access = False
        rejection_reason = ""

        if grant:
            granted_level = grant["permission_level"]

            if required_action == "read":
                # Both 'read' and 'edit' grants permit read
                has_access = True
            elif required_action == "edit":
                # Only 'edit' grant permits edit
                if granted_level == "edit":
                    has_access = True
                else:
                    rejection_reason = f"User has read-only permission; '{required_action}' requires edit permission."
            elif required_action == "delete":
                # Deletion is strictly reserved for Document Owner
                rejection_reason = (
                    "Document deletion is strictly restricted to the document owner."
                )
            elif required_action == "manage_permissions":
                # Managing access grants is strictly reserved for Document Owner
                rejection_reason = "Granting or revoking permissions is strictly restricted to the document owner."
        else:
            rejection_reason = f"No active permission grant exists for user on document '{doc_title}' (ID {document_id})."

        # Step 4: Separation of duties check for Administrators
        # Admins have oversight of metadata and audit logs, but CANNOT download private confidential payloads without grant
        if not has_access:
            # Synchronously record the refused attempt into the tamper-evident audit hash chain
            record_audit_event(
                action=f"DOC_{required_action.upper()}_DENIED",
                status="REFUSED",
                user_id=user_id,
                username=username,
                document_id=document_id,
                document_title=doc_title,
                ip_address=ip_address,
                user_agent=user_agent,
                details=f"ACCESS REFUSED: {rejection_reason} [Action={required_action}]",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {rejection_reason}",
            )

        return doc_dict


def require_document_read(
    user: dict[str, Any],
    document_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Authoritatively enforces document read permission."""
    return check_document_access(user, document_id, "read", ip_address, user_agent)


def require_document_edit(
    user: dict[str, Any],
    document_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Authoritatively enforces document edit permission."""
    return check_document_access(user, document_id, "edit", ip_address, user_agent)


def require_document_owner(
    user: dict[str, Any],
    document_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Authoritatively enforces document ownership for deletion or critical operations."""
    return check_document_access(user, document_id, "delete", ip_address, user_agent)


def require_document_permission_management(
    user: dict[str, Any],
    document_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Authoritatively enforces document permission management rights (strictly owner)."""
    return check_document_access(
        user, document_id, "manage_permissions", ip_address, user_agent
    )
