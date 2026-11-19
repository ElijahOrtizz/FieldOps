"""Login attempt limiter (in memory, per process).

Counts failed logins per email and per client address in a sliding window.
A successful login clears that email's count. State is per server process, so
with several instances the effective limit is per instance; fine for a pilot.
"""
import time
from collections import defaultdict, deque

WINDOW_SECONDS = 15 * 60
MAX_FAILS_PER_EMAIL = 10
MAX_FAILS_PER_IP = 30

_fails = defaultdict(deque)


def _prune(key, now):
    q = _fails[key]
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()
    return q


def retry_after(email: str, ip: str):
    """Seconds until another attempt is allowed, or 0 if not limited."""
    now = time.time()
    wait = 0
    for key, limit in ((("email", email), MAX_FAILS_PER_EMAIL), (("ip", ip), MAX_FAILS_PER_IP)):
        q = _prune(key, now)
        if len(q) >= limit:
            wait = max(wait, int(WINDOW_SECONDS - (now - q[0])) + 1)
    return wait


def record_failure(email: str, ip: str):
    now = time.time()
    _fails[("email", email)].append(now)
    _fails[("ip", ip)].append(now)


def record_success(email: str):
    _fails.pop(("email", email), None)


def reset():
    _fails.clear()
