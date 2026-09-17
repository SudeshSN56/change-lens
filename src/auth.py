"""Authentication (JWT) and role-based access for the API.

Users live in data/users.json as {userid: {password: <pbkdf2 hash>, role, name}}.
The file is created on first start with the default accounts below, so the
console is usable straight away; change the passwords through the admin page
or by deleting the file and letting it regenerate.

Tokens are standard HS256 JWTs (header.payload.signature, base64url) built
with the stdlib so no extra dependency is needed. The signing secret comes from
CHANGELENS_JWT_SECRET or, failing that, a random one persisted at
data/.jwt_secret so tokens survive an API restart.

Roles, lowest to highest:
    viewer   read-only: overview, query, explorer, tile assessments
    analyst  viewer + upload imagery to /api/analyze
    admin    analyst + user management
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
USERS_FILE = DATA / "users.json"
SECRET_FILE = DATA / ".jwt_secret"

ROLES = ("viewer", "analyst", "admin")
ROLE_RANK = {r: i for i, r in enumerate(ROLES)}
TOKEN_TTL = int(os.environ.get("CHANGELENS_TOKEN_TTL", 8 * 3600))  # seconds

# Default accounts, written only when users.json does not exist yet.
DEFAULT_USERS = [
    {"userid": "JOHNDOE", "password": "john@123", "role": "analyst", "name": "John Doe"},
    {"userid": "ADMIN", "password": "admin@123", "role": "admin", "name": "Console admin"},
]


# --- passwords ---------------------------------------------------------------
def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return "pbkdf2$" + salt.hex() + "$" + dk.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, dk_hex = stored.split("$")
    except ValueError:
        return False
    candidate = hash_password(password, bytes.fromhex(salt_hex)).split("$")[2]
    return hmac.compare_digest(candidate, dk_hex)


# --- user store --------------------------------------------------------------
class UserStore:
    def __init__(self, path: Path = USERS_FILE):
        self.path = path
        self.users: dict[str, dict] = {}
        self.load()

    def load(self):
        if not self.path.exists():
            self.users = {}
            for u in DEFAULT_USERS:
                self.users[u["userid"].upper()] = {
                    "userid": u["userid"].upper(),
                    "name": u["name"],
                    "role": u["role"],
                    "password": hash_password(u["password"]),
                }
            self.save()
            ids = ", ".join(u["userid"] for u in DEFAULT_USERS)
            print(f"[auth] created {self.path.name} with default accounts: {ids}")
            return
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        self.users = {k.upper(): {**v, "userid": k.upper()} for k, v in raw.items()}
        print(f"[auth] loaded {len(self.users)} user(s) from {self.path.name}")

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.users, indent=2), encoding="utf-8")

    def get(self, userid: str):
        return self.users.get((userid or "").strip().upper())

    def authenticate(self, userid: str, password: str):
        u = self.get(userid)
        if u and verify_password(password or "", u["password"]):
            return u
        return None

    def public(self, u: dict) -> dict:
        return {"userid": u["userid"], "name": u.get("name", ""), "role": u["role"]}

    def list(self):
        return [self.public(u) for u in sorted(self.users.values(), key=lambda x: x["userid"])]

    def upsert(self, userid: str, password: str | None, role: str, name: str = ""):
        uid = (userid or "").strip().upper()
        if not uid or not uid.replace("_", "").replace(".", "").isalnum():
            raise ValueError("userid must be letters, digits, '_' or '.'")
        if role not in ROLES:
            raise ValueError(f"role must be one of {', '.join(ROLES)}")
        existing = self.users.get(uid)
        if existing is None and not password:
            raise ValueError("a password is required for a new user")
        if password is not None and len(password) < 6:
            raise ValueError("password must be at least 6 characters")
        rec = dict(existing or {})
        rec.update({"userid": uid, "role": role, "name": name or rec.get("name", uid)})
        if password:
            rec["password"] = hash_password(password)
        self.users[uid] = rec
        self.save()
        return self.public(rec)

    def delete(self, userid: str):
        uid = (userid or "").strip().upper()
        if uid not in self.users:
            raise KeyError(uid)
        del self.users[uid]
        self.save()


# --- JWT ---------------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def load_secret() -> bytes:
    env = os.environ.get("CHANGELENS_JWT_SECRET")
    if env:
        return env.encode("utf-8")
    if SECRET_FILE.exists():
        return SECRET_FILE.read_bytes().strip()
    SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    secret = secrets.token_hex(32).encode("ascii")
    SECRET_FILE.write_bytes(secret)
    print(f"[auth] generated signing secret at {SECRET_FILE.name}")
    return secret


def encode_jwt(claims: dict, secret: bytes, ttl: int = TOKEN_TTL) -> str:
    now = int(time.time())
    payload = {**claims, "iat": now, "exp": now + ttl}
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header}.{body}".encode("ascii")
    sig = _b64(hmac.new(secret, signing_input, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


def decode_jwt(token: str, secret: bytes) -> dict | None:
    """Return the claims if the signature is valid and the token has not expired, else None."""
    try:
        header, body, sig = token.split(".")
        signing_input = f"{header}.{body}".encode("ascii")
        expected = _b64(hmac.new(secret, signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(expected, sig):
            return None
        if json.loads(_unb64(header)).get("alg") != "HS256":
            return None
        claims = json.loads(_unb64(body))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    if claims.get("exp", 0) < time.time():
        return None
    return claims


def has_role(user_role: str, required: str) -> bool:
    return ROLE_RANK.get(user_role, -1) >= ROLE_RANK[required]
