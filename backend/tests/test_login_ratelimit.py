"""Login rate limit: repeated failures are blocked, success still works, other emails unaffected."""
import pytest
import ratelimit


@pytest.fixture(autouse=True)
def _clean():
    ratelimit.reset()
    yield
    ratelimit.reset()


def _login(env, email, password):
    return env.client.post("/api/auth/login", json={"email": email, "password": password})


def test_good_login_works(env):
    assert _login(env, "worker@test.local", "test-only").status_code == 200


def test_repeated_failures_are_blocked_with_429(env):
    for _ in range(ratelimit.MAX_FAILS_PER_EMAIL):
        assert _login(env, "worker@test.local", "wrong").status_code == 401
    r = _login(env, "worker@test.local", "wrong")
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    # even the right password is blocked while limited
    assert _login(env, "worker@test.local", "test-only").status_code == 429


def test_other_account_not_blocked_by_one_accounts_failures(env):
    for _ in range(ratelimit.MAX_FAILS_PER_EMAIL):
        _login(env, "worker@test.local", "wrong")
    assert _login(env, "admin@test.local", "test-only").status_code == 200


def test_success_clears_the_email_counter(env):
    for _ in range(ratelimit.MAX_FAILS_PER_EMAIL - 1):
        _login(env, "worker@test.local", "wrong")
    assert _login(env, "worker@test.local", "test-only").status_code == 200
    for _ in range(ratelimit.MAX_FAILS_PER_EMAIL - 1):
        assert _login(env, "worker@test.local", "wrong").status_code == 401
