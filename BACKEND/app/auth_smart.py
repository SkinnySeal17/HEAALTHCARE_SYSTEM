import os
import secrets
import threading
import time
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

SYNTHETIC_PATIENT_ID = "PT-AU-94821"
SYNTHETIC_FHIR_USER = "DrAlexSmith"
SYNTHETIC_CLIENT_CONTEXT = {
    "patient": SYNTHETIC_PATIENT_ID,
    "fhirUser": SYNTHETIC_FHIR_USER,
}

AUTH_CODE_TTL_SECONDS = 90
ACCESS_TOKEN_TTL_SECONDS = 3600
ISSUER = os.environ.get("SMART_ISSUER", "http://localhost:8000")
DEFAULT_SCOPES = (
    "openid fhirUser launch launch/patient patient/*.read user/*.read"
)

PRODUCTION_HOST_MARKERS = (
    "bestpractice.com.au",
    "bpsoftware.net",
    "myhealthrecord",
    "digitalhealth.gov.au",
    "servicesaustralia",
    "medicare",
    "oraclehealth",
    "cerner.com",
    "epic.com",
    "ihi.gov",
)

REAL_IDENTIFIER_PREFIXES = ("800360",)

_store_lock = threading.Lock()
_authorization_codes: dict[str, dict] = {}
_access_tokens: dict[str, dict] = {}

app = FastAPI(title="MedTalk Connect SMART Sandbox IdP", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _is_synthetic_url(value: str | None) -> bool:
    if not value:
        return False
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        return True
    if "sandbox" in host or "synthetic" in host:
        return True
    return False


def _is_production_url(value: str | None) -> bool:
    if not value:
        return False
    lowered = value.lower()
    return any(marker in lowered for marker in PRODUCTION_HOST_MARKERS)


def _assert_sandbox_target(value: str | None, field_name: str) -> None:
    if not value:
        return
    if _is_production_url(value) or not _is_synthetic_url(value):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} is outside the synthetic sandbox boundary",
        )


def _purge_expired(now: float) -> None:
    expired_codes = [
        code
        for code, record in _authorization_codes.items()
        if record["expires_at"] <= now
    ]
    for code in expired_codes:
        _authorization_codes.pop(code, None)
    expired_tokens = [
        token
        for token, record in _access_tokens.items()
        if record["expires_at"] <= now
    ]
    for token in expired_tokens:
        _access_tokens.pop(token, None)


def _discovery_document() -> dict:
    return {
        "issuer": ISSUER,
        "authorization_endpoint": f"{ISSUER}/auth/authorize",
        "token_endpoint": f"{ISSUER}/auth/token",
        "grant_types_supported": ["authorization_code"],
        "response_types_supported": ["code"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": [
            "none",
            "client_secret_post",
        ],
        "scopes_supported": [
            "openid",
            "fhirUser",
            "launch",
            "launch/patient",
            "patient/*.read",
            "user/*.read",
        ],
        "capabilities": [
            "launch-ehr",
            "client-public",
            "client-confidential-symmetric",
            "context-ehr-patient",
            "sso-openid-connect",
            "permission-patient",
            "permission-user",
        ],
    }


async def _read_token_payload(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        return body if isinstance(body, dict) else {}
    form = await request.form()
    return {key: str(value) for key, value in form.items()}


def _append_query(url: str, extra: dict) -> str:
    parsed = urlparse(url)
    merged = parse_qs(parsed.query, keep_blank_values=True)
    for key, value in extra.items():
        merged[key] = [value]
    query = urlencode(merged, doseq=True)
    return urlunparse(parsed._replace(query=query))


@app.get("/.well-known/smart-configuration")
def smart_configuration() -> dict:
    return _discovery_document()


@app.get("/auth/authorize", response_model=None)
def authorize(
    response_type: str = "code",
    client_id: str = "medtalk-connect-sandbox",
    redirect_uri: str | None = None,
    scope: str | None = None,
    state: str | None = None,
    aud: str | None = None,
    launch: str | None = None,
):
    if response_type != "code":
        raise HTTPException(status_code=400, detail="response_type must be code")
    if not client_id.strip():
        raise HTTPException(status_code=400, detail="client_id is required")

    _assert_sandbox_target(aud, "aud")
    _assert_sandbox_target(redirect_uri, "redirect_uri")

    now = time.time()
    code = secrets.token_urlsafe(24)
    record = {
        "client_id": client_id.strip(),
        "redirect_uri": redirect_uri,
        "scope": scope or DEFAULT_SCOPES,
        "state": state,
        "launch": launch,
        "patient": SYNTHETIC_PATIENT_ID,
        "fhirUser": SYNTHETIC_FHIR_USER,
        "expires_at": now + AUTH_CODE_TTL_SECONDS,
    }

    with _store_lock:
        _purge_expired(now)
        _authorization_codes[code] = record

    payload = {
        "code": code,
        "expires_in": AUTH_CODE_TTL_SECONDS,
    }
    if state:
        payload["state"] = state

    if redirect_uri:
        return RedirectResponse(
            url=_append_query(redirect_uri, payload),
            status_code=302,
        )

    return JSONResponse(payload)


@app.post("/auth/token")
async def token(request: Request) -> dict:
    payload = await _read_token_payload(request)
    grant_type = str(payload.get("grant_type", "")).strip()
    code = str(payload.get("code", "")).strip()
    client_id = str(payload.get("client_id", "")).strip()
    redirect_uri = payload.get("redirect_uri")

    if grant_type != "authorization_code":
        raise HTTPException(
            status_code=400,
            detail="grant_type must be authorization_code",
        )
    if not code:
        raise HTTPException(status_code=400, detail="code is required")

    _assert_sandbox_target(redirect_uri, "redirect_uri")

    now = time.time()
    with _store_lock:
        _purge_expired(now)
        record = _authorization_codes.pop(code, None)

    if record is None:
        raise HTTPException(
            status_code=400,
            detail="authorization code is invalid or expired",
        )
    if record["expires_at"] <= now:
        raise HTTPException(
            status_code=400,
            detail="authorization code is invalid or expired",
        )
    if client_id and client_id != record["client_id"]:
        raise HTTPException(status_code=400, detail="client_id mismatch")
    if (
        redirect_uri
        and record["redirect_uri"]
        and redirect_uri != record["redirect_uri"]
    ):
        raise HTTPException(status_code=400, detail="redirect_uri mismatch")

    if record["patient"] != SYNTHETIC_PATIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="non-synthetic patient context blocked",
        )
    if any(record["patient"].startswith(prefix) for prefix in REAL_IDENTIFIER_PREFIXES):
        raise HTTPException(
            status_code=500,
            detail="real clinical identifier blocked",
        )

    access_token = secrets.token_urlsafe(32)
    token_record = {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
        "scope": record["scope"],
        "patient": SYNTHETIC_PATIENT_ID,
        "fhirUser": SYNTHETIC_FHIR_USER,
        "expires_at": now + ACCESS_TOKEN_TTL_SECONDS,
    }

    with _store_lock:
        _access_tokens[access_token] = token_record

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
        "scope": record["scope"],
        **SYNTHETIC_CLIENT_CONTEXT,
    }
