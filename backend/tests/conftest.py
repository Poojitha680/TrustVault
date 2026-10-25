import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import backend.app.config as app_config
import backend.app.database as app_db
import backend.app.storage as app_storage
from backend.app.main import app
from backend.app.security import clear_login_attempts


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Isolate tests into a temporary SQLite database and storage directory."""
    temp_dir = tempfile.mkdtemp(prefix="trustvault_test_")
    test_db_path = Path(temp_dir) / "test_trustvault.db"
    test_storage_dir = Path(temp_dir) / "test_vault_storage"
    test_storage_dir.mkdir(parents=True, exist_ok=True)

    orig_db_path = app_config.DATABASE_PATH
    orig_storage_dir = app_config.STORAGE_DIR

    app_config.DATABASE_PATH = test_db_path
    app_db.DATABASE_PATH = test_db_path
    app_config.STORAGE_DIR = test_storage_dir
    app_storage.STORAGE_DIR = test_storage_dir

    app_db.init_db()
    from backend.app.seed import seed_database
    seed_database()

    yield

    # Restore original paths and cleanup test files
    app_config.DATABASE_PATH = orig_db_path
    app_db.DATABASE_PATH = orig_db_path
    app_config.STORAGE_DIR = orig_storage_dir
    app_storage.STORAGE_DIR = orig_storage_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def client():
    """Returns a test client instance."""
    return TestClient(app)


def get_auth_headers_for(client: TestClient, username: str, password: str) -> dict:
    clear_login_attempts(f"user:{username}")
    clear_login_attempts("ip:127.0.0.1")
    clear_login_attempts("ip:testclient")
    res = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(client):
    return get_auth_headers_for(client, "admin", "AdminPassword123!")


@pytest.fixture
def alice_headers(client):
    return get_auth_headers_for(client, "alice_owner", "OwnerPassword123!")


@pytest.fixture
def bob_headers(client):
    return get_auth_headers_for(client, "bob_owner", "OwnerPassword123!")


@pytest.fixture
def charlie_headers(client):
    return get_auth_headers_for(client, "charlie_viewer", "ViewerPassword123!")


@pytest.fixture
def eve_headers(client):
    return get_auth_headers_for(client, "eve_attacker", "AttackerPassword123!")
