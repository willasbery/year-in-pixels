from __future__ import annotations

import datetime as dt
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.main import create_app

from asgi_client import asgi_request


class ApiContractTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_path = Path(self.temp_dir.name) / "test-data.db"
        self.app = create_app(
            database_path=self.data_path,
            dev_bearer_token="cheese",
            allow_insecure_apple_auth=True,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    async def test_health_and_auth_required(self) -> None:
        health = await asgi_request(self.app, "GET", "/health")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["ok"])

        moods = await asgi_request(self.app, "GET", "/moods?year=2026")
        self.assertEqual(moods.status_code, 401)
        self.assertEqual(moods.json()["error"], "Missing Bearer token.")

    async def test_full_flow_for_user_session(self) -> None:
        auth = await asgi_request(
            self.app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-123"},
        )
        self.assertEqual(auth.status_code, 200)
        access_token = auth.json()["accessToken"]
        self.assertTrue(access_token)
        headers = {"authorization": f"Bearer {access_token}"}

        put_mood = await asgi_request(
            self.app,
            "PUT",
            "/moods/2026-02-18",
            headers=headers,
            json_body={"level": 4, "note": "  good day  "},
        )
        self.assertEqual(put_mood.status_code, 200)
        self.assertEqual(put_mood.json(), {"date": "2026-02-18", "level": 4, "note": "good day"})

        moods = await asgi_request(self.app, "GET", "/moods?year=2026", headers=headers)
        self.assertEqual(moods.status_code, 200)
        self.assertEqual(moods.json()["moods"], [{"date": "2026-02-18", "level": 4, "note": "good day"}])

        invalid_level = await asgi_request(
            self.app,
            "PUT",
            "/moods/2026-02-19",
            headers=headers,
            json_body={"level": 8},
        )
        self.assertEqual(invalid_level.status_code, 400)

        remove_mood = await asgi_request(self.app, "DELETE", "/moods/2026-02-18", headers=headers)
        self.assertEqual(remove_mood.status_code, 204)

        patch_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={
                "bgColor": "112233",
                "moodColors": {"1": "#ffffff"},
                "shape": "square",
                "bgImageUrl": None,
            },
        )
        self.assertEqual(patch_theme.status_code, 200)
        theme = patch_theme.json()
        self.assertEqual(theme["bg_color"], "#112233")
        self.assertEqual(theme["mood_colors"]["1"], "#ffffff")
        self.assertEqual(theme["shape"], "square")
        self.assertIsNone(theme["bg_image_url"])

        token_response = await asgi_request(self.app, "GET", "/token", headers=headers)
        self.assertEqual(token_response.status_code, 200)
        old_token = token_response.json()["token"]
        self.assertTrue(old_token)

        wallpaper = await asgi_request(self.app, "GET", f"/w/{old_token}")
        self.assertEqual(wallpaper.status_code, 200)
        self.assertEqual(wallpaper.headers.get("content-type"), "image/png")
        self.assertTrue(wallpaper.body.startswith(b"\x89PNG\r\n\x1a\n"))

        rotate = await asgi_request(self.app, "POST", "/token/rotate", headers=headers)
        self.assertEqual(rotate.status_code, 200)
        new_token = rotate.json()["token"]
        self.assertNotEqual(old_token, new_token)

        old_wallpaper = await asgi_request(self.app, "GET", f"/w/{old_token}")
        self.assertEqual(old_wallpaper.status_code, 404)

        new_wallpaper = await asgi_request(self.app, "GET", f"/w/{new_token}")
        self.assertEqual(new_wallpaper.status_code, 200)

        logout = await asgi_request(self.app, "DELETE", "/auth/session", headers=headers)
        self.assertEqual(logout.status_code, 204)

        after_logout = await asgi_request(self.app, "GET", "/theme", headers=headers)
        self.assertEqual(after_logout.status_code, 401)

    async def test_dev_session_is_persistent(self) -> None:
        dev_headers = {"authorization": "Bearer cheese"}

        before = await asgi_request(self.app, "GET", "/theme", headers=dev_headers)
        self.assertEqual(before.status_code, 200)

        logout = await asgi_request(self.app, "DELETE", "/auth/session", headers=dev_headers)
        self.assertEqual(logout.status_code, 204)

        after = await asgi_request(self.app, "GET", "/theme", headers=dev_headers)
        self.assertEqual(after.status_code, 200)

    async def test_apple_auth_requires_valid_identity_token_when_insecure_mode_is_disabled(self) -> None:
        strict_app = create_app(
            database_path=self.data_path,
            dev_bearer_token="",
            allow_insecure_apple_auth=False,
            apple_client_ids=("com.example.yearinpixels",),
        )

        invalid = await asgi_request(
            strict_app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "not-a-jwt"},
        )
        self.assertEqual(invalid.status_code, 401)
        self.assertIn("Malformed", invalid.json()["error"])

    async def test_auth_rate_limit_blocks_excessive_apple_sign_in_attempts(self) -> None:
        limited_app = create_app(
            database_path=self.data_path,
            dev_bearer_token="",
            allow_insecure_apple_auth=True,
            auth_rate_limit_max_requests=2,
            auth_rate_limit_window_seconds=60,
            auth_rate_limit_block_seconds=60,
        )

        first = await asgi_request(
            limited_app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-a"},
        )
        second = await asgi_request(
            limited_app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-b"},
        )
        third = await asgi_request(
            limited_app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-c"},
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.json()["error"], "Too many sign-in attempts. Try again later.")
        self.assertTrue(third.headers.get("retry-after"))

    async def test_session_rotation_returns_fresh_header_token(self) -> None:
        rotating_app = create_app(
            database_path=self.data_path,
            dev_bearer_token="",
            allow_insecure_apple_auth=True,
            session_rotate_interval_seconds=60,
        )

        auth = await asgi_request(
            rotating_app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-rotate"},
        )
        self.assertEqual(auth.status_code, 200)
        old_token = auth.json()["accessToken"]

        old_created_at = (dt.datetime.now(dt.UTC) - dt.timedelta(minutes=5)).isoformat()
        with sqlite3.connect(self.data_path) as conn:
            conn.execute(
                "UPDATE sessions SET created_at = ? WHERE token = ?",
                (old_created_at, old_token),
            )
            conn.commit()

        old_headers = {"authorization": f"Bearer {old_token}"}
        theme = await asgi_request(rotating_app, "GET", "/theme", headers=old_headers)
        self.assertEqual(theme.status_code, 200)
        rotated_token = theme.headers.get("x-session-token")
        self.assertTrue(rotated_token)
        self.assertNotEqual(rotated_token, old_token)
        self.assertTrue(theme.headers.get("x-session-expires-at"))

        old_after_rotation = await asgi_request(rotating_app, "GET", "/theme", headers=old_headers)
        self.assertEqual(old_after_rotation.status_code, 401)

        rotated_headers = {"authorization": f"Bearer {rotated_token}"}
        rotated_ok = await asgi_request(rotating_app, "GET", "/theme", headers=rotated_headers)
        self.assertEqual(rotated_ok.status_code, 200)

    async def test_expired_session_is_rejected(self) -> None:
        app = create_app(
            database_path=self.data_path,
            dev_bearer_token="",
            allow_insecure_apple_auth=True,
        )

        auth = await asgi_request(
            app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-expire"},
        )
        self.assertEqual(auth.status_code, 200)
        token = auth.json()["accessToken"]

        expired_at = (dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1)).isoformat()
        with sqlite3.connect(self.data_path) as conn:
            conn.execute("UPDATE sessions SET expires_at = ? WHERE token = ?", (expired_at, token))
            conn.commit()

        response = await asgi_request(app, "GET", "/theme", headers={"authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "Session expired. Sign in again.")


if __name__ == "__main__":
    unittest.main()
