import pytest
from fastapi.testclient import TestClient

from backend.app.database import init_db
from backend.app.main import app
from backend.app.seed import seed_database


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Ensure database schema is initialized and seeded with test personas."""
    init_db()
    seed_database()


@pytest.fixture
def client():
    """Returns a test client instance."""
    return TestClient(app)


from backend.app.security import clear_login_attempts


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
