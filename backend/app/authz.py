from typing import Any, Literal

from fastapi import HTTPException, status

from backend.app.audit import record_audit_event
from backend.app.database import get_db

PermissionAction = Literal[
    "read", "preview", "download", "edit", "delete", "manage_permissions"
]


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
    Strictly enforces:
    - Viewers are read-only (preview/read allowed; edit/delete/share denied).
    - Downloading requires explicit download authorization for viewers.
    - If access is denied, synchronously appends a REFUSED audit event to the hash chain
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
                   owner_id, allow_viewer_download, is_deleted, created_at, updated_at
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
        allow_viewer_download = bool(doc_dict.get("allow_viewer_download", 0))

        # Step 2: Strict Viewer Role restrictions for mutation/administrative actions
        if role == "viewer" and required_action in ("edit", "delete", "manage_permissions"):
            rejection_reason = (
                f"Viewers have strictly read-only access. The '{required_action}' operation is not permitted for viewers."
            )
            record_audit_event(
                action=f"DOC_{required_action.upper()}_DENIED",
                status="REFUSED",
                user_id=user_id,
                username=username,
                document_id=document_id,
                document_title=doc_title,
                ip_address=ip_address,
                user_agent=user_agent,
                details=f"ACCESS REFUSED: {rejection_reason} [Role=viewer, Action={required_action}]",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {rejection_reason}",
            )

        # Step 3: Admin role evaluation
        # Administrators have operational oversight to manage documents (edit metadata, delete, manage permissions)
        if role == "admin":
            if required_action in ("read", "preview", "edit", "delete", "manage_permissions"):
                return doc_dict
            elif required_action == "download":
                # Admin can download if they own the document or if it is not restricted
                if owner_id == user_id or doc_dict.get("sensitivity") != "Restricted":
                    return doc_dict
                # For private restricted documents, verify explicit grant
                cursor.execute(
                    "SELECT can_download FROM document_permissions WHERE document_id = ? AND user_id = ?",
                    (document_id, user_id),
                )
                admin_grant = cursor.fetchone()
                if admin_grant and admin_grant["can_download"]:
                    return doc_dict
                rejection_reason = "Administrators have operational oversight but cannot download private restricted documents without an explicit grant."
                record_audit_event(
                    action="DOC_DOWNLOAD_DENIED",
                    status="REFUSED",
                    user_id=user_id,
                    username=username,
                    document_id=document_id,
                    document_title=doc_title,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    details=f"ACCESS REFUSED: {rejection_reason} [Role=admin, Action=download]",
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: {rejection_reason}",
                )

        # Step 4: Document Owner evaluation
        if owner_id == user_id:
            if role == "viewer":
                if required_action in ("read", "preview"):
                    return doc_dict
                elif required_action == "download":
                    if allow_viewer_download:
                        return doc_dict
                    else:
                        rejection_reason = "Document access policy restricts viewer access to in-browser preview. Downloading is not permitted."
                else:
                    rejection_reason = f"Viewers have strictly read-only access. '{required_action}' is not permitted."
            else:
                return doc_dict
        else:
            # Step 5: Check named direct grants in document_permissions
            cursor.execute(
                """
                SELECT permission_level, can_download, granted_by, granted_at
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
                grant_can_download = bool(grant["can_download"]) if "can_download" in grant.keys() else False

                if required_action in ("read", "preview"):
                    # Both 'read' and 'edit' grants permit read and in-browser preview
                    has_access = True
                elif required_action == "download":
                    if role == "viewer":
                        # Viewers may only download if document policy or user grant explicitly permits it
                        if grant_can_download or allow_viewer_download:
                            has_access = True
                        else:
                            rejection_reason = "Document access policy restricts viewer access to in-browser preview. Downloading is not permitted."
                    else:
                        has_access = True
                elif required_action == "edit":
                    if role == "viewer":
                        rejection_reason = "Viewers have strictly read-only access and cannot edit document content or metadata."
                    elif granted_level == "edit":
                        has_access = True
                    else:
                        rejection_reason = f"User has read-only permission; '{required_action}' requires edit permission."
                elif required_action == "delete":
                    rejection_reason = "Document deletion is strictly restricted to the document owner or administrator."
                elif required_action == "manage_permissions":
                    rejection_reason = "Granting or revoking permissions is strictly restricted to the document owner or administrator."
            else:
                rejection_reason = f"No active permission grant exists for user on document '{doc_title}' (ID {document_id})."

            if has_access:
                return doc_dict

        # Step 5: Synchronously record the refused attempt into the tamper-evident audit hash chain
        record_audit_event(
            action=f"DOC_{required_action.upper()}_DENIED",
            status="REFUSED",
            user_id=user_id,
            username=username,
            document_id=document_id,
            document_title=doc_title,
            ip_address=ip_address,
            user_agent=user_agent,
            details=f"ACCESS REFUSED: {rejection_reason} [Role={role}, Action={required_action}]",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: {rejection_reason}",
        )


def require_document_read(
    user: dict[str, Any],
    document_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Authoritatively enforces document read permission."""
    return check_document_access(user, document_id, "read", ip_address, user_agent)


def require_document_preview(
    user: dict[str, Any],
    document_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Authoritatively enforces in-browser document preview permission."""
    return check_document_access(user, document_id, "preview", ip_address, user_agent)


def require_document_download(
    user: dict[str, Any],
    document_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Authoritatively enforces document download permission (distinguishing preview vs download)."""
    return check_document_access(user, document_id, "download", ip_address, user_agent)


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
