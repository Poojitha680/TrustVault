from backend.app.security import clear_login_attempts


def test_login_success(client):
    """Authenticates valid credentials and receives signed JWT."""
    res = client.post(
        "/api/auth/login",
        json={"username": "alice_owner", "password": "OwnerPassword123!"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["username"] == "alice_owner"
    assert data["user"]["role"] == "owner"


def test_login_invalid_credentials_generic_error(client):
    """Returns generic error that does not disclose whether the username exists."""
    # Non-existent user
    res1 = client.post(
        "/api/auth/login",
        json={"username": "nobody_exists", "password": "RandomPassword!"},
    )
    assert res1.status_code == 401
    assert res1.json()["detail"] == "Incorrect username or password."

    # Existing user, wrong password
    res2 = client.post(
        "/api/auth/login",
        json={"username": "alice_owner", "password": "WrongPassword!"},
    )
    assert res2.status_code == 401
    assert res2.json()["detail"] == "Incorrect username or password."


def test_login_rate_limiting(client):
    """Exceeding max consecutive failed login attempts triggers HTTP 429 Too Many Requests."""
    test_user = "rate_limit_test_user"
    clear_login_attempts(f"user:{test_user}")
    clear_login_attempts("ip:127.0.0.1")
    clear_login_attempts("ip:testclient")

    # Send 5 failed attempts
    for _ in range(5):
        client.post(
            "/api/auth/login", json={"username": test_user, "password": "BadPassword!"}
        )

    # The 6th attempt must be blocked by rate limiter
    locked_res = client.post(
        "/api/auth/login", json={"username": test_user, "password": "BadPassword!"}
    )
    assert locked_res.status_code == 429
    assert "Too many failed login attempts" in locked_res.json()["detail"]

    # Clean up state
    clear_login_attempts(f"user:{test_user}")
    clear_login_attempts("ip:127.0.0.1")
    clear_login_attempts("ip:testclient")


def test_immediate_token_revocation_on_logout(client):
    """Logging out immediately invalidates the token so it cannot be reused."""
    clear_login_attempts("user:alice_owner")
    clear_login_attempts("ip:127.0.0.1")
    clear_login_attempts("ip:testclient")
    login_res = client.post(
        "/api/auth/login",
        json={"username": "alice_owner", "password": "OwnerPassword123!"},
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify token works
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200

    # Logout
    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Token is now revoked; next request must return 401 Unauthorized
    post_logout_res = client.get("/api/auth/me", headers=headers)
    assert post_logout_res.status_code == 401
    assert "revoked" in post_logout_res.json()["detail"].lower()
