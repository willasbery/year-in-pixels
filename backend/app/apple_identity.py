from __future__ import annotations

import base64
import hashlib
import json
import threading
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

_SHA256_DIGEST_INFO_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")


def _decode_b64url(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _decode_json_segment(value: str) -> dict[str, Any]:
    raw = _decode_b64url(value)
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("JWT segment must decode to a JSON object.")
    return parsed


def _to_int(value: Any, *, field_name: str) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    raise ValueError(f"Invalid {field_name!r} claim.")


@dataclass(frozen=True)
class AppleIdentityClaims:
    subject: str
    audience: str
    issued_at_unix: int
    expires_at_unix: int
    email: str | None


class AppleIdentityVerifier:
    def __init__(
        self,
        *,
        jwks_url: str,
        issuer: str,
        client_ids: tuple[str, ...],
        cache_ttl_seconds: int = 3600,
        timeout_seconds: float = 3.0,
    ) -> None:
        if not client_ids:
            raise ValueError("At least one Apple client ID is required to verify identity tokens.")

        self.jwks_url = jwks_url
        self.issuer = issuer
        self.client_ids = client_ids
        self.cache_ttl_seconds = max(60, int(cache_ttl_seconds))
        self.timeout_seconds = timeout_seconds

        self._lock = threading.RLock()
        self._cache_expires_at_monotonic = 0.0
        self._cached_keys: dict[str, tuple[int, int]] = {}

    def verify_identity_token(self, identity_token: str) -> AppleIdentityClaims:
        token = identity_token.strip()
        if not token:
            raise ValueError("identityToken is required.")

        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed identityToken.")

        header_raw, payload_raw, signature_raw = parts
        header = _decode_json_segment(header_raw)
        payload = _decode_json_segment(payload_raw)

        alg = header.get("alg")
        kid = header.get("kid")
        if alg != "RS256" or not isinstance(kid, str) or not kid:
            raise ValueError("Unsupported Apple identity token signature.")

        modulus, exponent = self._get_signing_key(kid)
        self._verify_rs256_signature(
            signing_input=f"{header_raw}.{payload_raw}".encode("ascii"),
            signature=_decode_b64url(signature_raw),
            modulus=modulus,
            exponent=exponent,
        )

        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            raise ValueError("Apple identity token is missing subject.")

        issuer = payload.get("iss")
        if issuer != self.issuer:
            raise ValueError("Apple identity token issuer is invalid.")

        audience = self._extract_audience(payload.get("aud"))
        if audience not in self.client_ids:
            raise ValueError("Apple identity token audience is invalid.")

        now_unix = int(time.time())
        issued_at_unix = _to_int(payload.get("iat"), field_name="iat")
        expires_at_unix = _to_int(payload.get("exp"), field_name="exp")
        if issued_at_unix > now_unix + 300:
            raise ValueError("Apple identity token was issued in the future.")
        if expires_at_unix <= now_unix:
            raise ValueError("Apple identity token has expired.")

        email = payload.get("email")
        normalized_email = email if isinstance(email, str) and email.strip() else None

        return AppleIdentityClaims(
            subject=subject.strip(),
            audience=audience,
            issued_at_unix=issued_at_unix,
            expires_at_unix=expires_at_unix,
            email=normalized_email,
        )

    def _extract_audience(self, audience: Any) -> str:
        if isinstance(audience, str) and audience.strip():
            return audience
        if isinstance(audience, list):
            for entry in audience:
                if isinstance(entry, str) and entry.strip():
                    return entry
        raise ValueError("Apple identity token audience is invalid.")

    def _refresh_keys_if_needed(self) -> None:
        now = time.monotonic()
        if self._cached_keys and now < self._cache_expires_at_monotonic:
            return

        with self._lock:
            now = time.monotonic()
            if self._cached_keys and now < self._cache_expires_at_monotonic:
                return

            keys = self._fetch_apple_jwks()
            self._cached_keys = keys
            self._cache_expires_at_monotonic = now + self.cache_ttl_seconds

    def _get_signing_key(self, kid: str) -> tuple[int, int]:
        self._refresh_keys_if_needed()

        with self._lock:
            key = self._cached_keys.get(kid)
            if key:
                return key

            # Force one immediate refresh in case Apple just rotated keys.
            keys = self._fetch_apple_jwks()
            self._cached_keys = keys
            self._cache_expires_at_monotonic = time.monotonic() + self.cache_ttl_seconds
            key = keys.get(kid)
            if key:
                return key

        raise ValueError("Apple identity token key ID is unknown.")

    def _fetch_apple_jwks(self) -> dict[str, tuple[int, int]]:
        try:
            with urlopen(self.jwks_url, timeout=self.timeout_seconds) as response:
                payload = response.read().decode("utf-8")
        except URLError as error:
            raise ValueError("Unable to fetch Apple signing keys.") from error

        parsed = json.loads(payload)
        raw_keys = parsed.get("keys") if isinstance(parsed, dict) else None
        if not isinstance(raw_keys, list):
            raise ValueError("Apple signing keys response was invalid.")

        keys: dict[str, tuple[int, int]] = {}
        for raw_key in raw_keys:
            if not isinstance(raw_key, dict):
                continue
            if raw_key.get("kty") != "RSA":
                continue
            kid = raw_key.get("kid")
            n = raw_key.get("n")
            e = raw_key.get("e")
            if not isinstance(kid, str) or not kid:
                continue
            if not isinstance(n, str) or not isinstance(e, str):
                continue

            try:
                modulus = int.from_bytes(_decode_b64url(n), byteorder="big")
                exponent = int.from_bytes(_decode_b64url(e), byteorder="big")
            except (ValueError, TypeError):
                continue

            if modulus <= 0 or exponent <= 0:
                continue
            keys[kid] = (modulus, exponent)

        if not keys:
            raise ValueError("Apple signing keys response contained no usable RSA keys.")
        return keys

    def _verify_rs256_signature(self, *, signing_input: bytes, signature: bytes, modulus: int, exponent: int) -> None:
        key_size = (modulus.bit_length() + 7) // 8
        if key_size < 256:
            raise ValueError("Apple signing key is too small.")
        if len(signature) > key_size:
            raise ValueError("Apple identity token signature is invalid.")

        signature_int = int.from_bytes(signature, byteorder="big")
        if signature_int >= modulus:
            raise ValueError("Apple identity token signature is invalid.")

        encoded_message = pow(signature_int, exponent, modulus).to_bytes(key_size, byteorder="big")

        if not encoded_message.startswith(b"\x00\x01"):
            raise ValueError("Apple identity token signature is invalid.")

        separator = encoded_message.find(b"\x00", 2)
        if separator <= 10:
            raise ValueError("Apple identity token signature is invalid.")

        padding = encoded_message[2:separator]
        if any(byte != 0xFF for byte in padding):
            raise ValueError("Apple identity token signature is invalid.")

        expected_digest_info = _SHA256_DIGEST_INFO_PREFIX + hashlib.sha256(signing_input).digest()
        if encoded_message[separator + 1 :] != expected_digest_info:
            raise ValueError("Apple identity token signature is invalid.")
