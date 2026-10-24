import uuid
from pathlib import Path

from backend.app.config import STORAGE_DIR
from backend.app.security import (
    decrypt_vault_payload,
    encrypt_vault_payload,
)


class VaultStorageManager:
    """
    Manages encrypted file storage at rest.
    Files are stored in isolated vault directories with randomized UUIDs
    and AES-256-GCM authenticated encryption.
    """

    @staticmethod
    def store_file(plaintext_bytes: bytes) -> tuple[str, str, int]:
        """
        Encrypts and writes plaintext bytes to disk.
        Returns: (file_uuid, relative_storage_path, plaintext_size)
        """
        file_uuid = str(uuid.uuid4())
        relative_filename = f"{file_uuid}.enc"
        absolute_path = STORAGE_DIR / relative_filename

        encrypted_payload = encrypt_vault_payload(plaintext_bytes)

        # Write to disk securely
        with open(absolute_path, "wb") as f:
            f.write(encrypted_payload)

        return file_uuid, relative_filename, len(plaintext_bytes)

    @staticmethod
    def retrieve_file(relative_storage_path: str) -> bytes:
        """
        Reads encrypted payload from disk and decrypts using AES-256-GCM.
        Guarantees authenticity and confidentiality.
        """
        # Protect against path traversal in relative_storage_path
        safe_name = Path(relative_storage_path).name
        target_path = STORAGE_DIR / safe_name

        if not target_path.exists():
            raise FileNotFoundError(
                "Requested vault storage object does not exist on disk."
            )

        with open(target_path, "rb") as f:
            encrypted_payload = f.read()

        return decrypt_vault_payload(encrypted_payload)

    @staticmethod
    def delete_file(relative_storage_path: str) -> bool:
        """Securely deletes the encrypted file from storage."""
        try:
            safe_name = Path(relative_storage_path).name
            target_path = STORAGE_DIR / safe_name
            if target_path.exists():
                target_path.unlink()
                return True
        except Exception:
            pass
        return False
