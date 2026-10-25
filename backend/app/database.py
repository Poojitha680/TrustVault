import sqlite3
from collections.abc import Generator
from contextlib import contextmanager

from backend.app.config import DATABASE_PATH


def get_db_connection() -> sqlite3.Connection:
    """Creates a configured connection to the SQLite database with WAL mode and foreign keys."""
    conn = sqlite3.connect(DATABASE_PATH, timeout=20.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for acquiring and safely releasing database connections."""
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initializes schema and tamper-evident append-only triggers."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'viewer')),
                password_hash TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
        """)

        # Documents table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                sha256_hash TEXT NOT NULL,
                category TEXT NOT NULL,
                sensitivity TEXT NOT NULL DEFAULT 'Confidential',
                owner_id INTEGER NOT NULL,
                allow_viewer_download INTEGER NOT NULL DEFAULT 0,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT
            );
        """)

        # Document permissions table (per-document grant to named users)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS document_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                permission_level TEXT NOT NULL CHECK (permission_level IN ('read', 'edit')),
                can_download INTEGER NOT NULL DEFAULT 0,
                granted_by INTEGER NOT NULL,
                granted_at TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE RESTRICT,
                UNIQUE (document_id, user_id)
            );
        """)

        # Migration checks for existing databases
        cursor.execute("PRAGMA table_info(documents);")
        doc_cols = [c["name"] for c in cursor.fetchall()]
        if "allow_viewer_download" not in doc_cols:
            cursor.execute("ALTER TABLE documents ADD COLUMN allow_viewer_download INTEGER NOT NULL DEFAULT 0;")

        cursor.execute("PRAGMA table_info(document_permissions);")
        perm_cols = [c["name"] for c in cursor.fetchall()]
        if "can_download" not in perm_cols:
            cursor.execute("ALTER TABLE document_permissions ADD COLUMN can_download INTEGER NOT NULL DEFAULT 0;")

        # Revoked Tokens Table (for immediate token cancellation / logout)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                jti TEXT PRIMARY KEY,
                revoked_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
        """)

        # Tamper-Evident Audit Logs Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sequence_number INTEGER UNIQUE NOT NULL,
                timestamp TEXT NOT NULL,
                user_id INTEGER,
                username TEXT NOT NULL,
                action TEXT NOT NULL,
                document_id INTEGER,
                document_title TEXT,
                status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'REFUSED', 'SECURITY_ALERT')),
                ip_address TEXT,
                user_agent TEXT,
                details TEXT,
                previous_hash TEXT NOT NULL,
                entry_hash TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
                FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE SET NULL
            );
        """)

        # Indices for performance and security queries
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_doc_owner ON documents(owner_id);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_perm_doc_user ON document_permissions(document_id, user_id);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_perm_user ON document_permissions(user_id);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit_logs(sequence_number);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit_logs(document_id);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);"
        )

        # Tamper-evident DB triggers: prohibit modification or deletion of audit logs
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS prevent_audit_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit log records are cryptographically immutable and cannot be updated.');
            END;
        """)

        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit log records are cryptographically immutable and cannot be deleted.');
            END;
        """)
