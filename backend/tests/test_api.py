from __future__ import annotations

import datetime as dt
import os
import unittest
import uuid

import psycopg

from app.cache import set_cached_wallpaper
from app.constants import DEFAULT_THEME
from app.main import create_app

from asgi_client import asgi_request

TEST_DATABASE_URL = (os.getenv("TEST_DATABASE_URL") or "").strip()


def _reset_api_tables(database_url: str) -> None:
    with psycopg.connect(database_url) as conn:
        conn.execute("DROP TABLE IF EXISTS moods CASCADE")
        conn.execute("DROP TABLE IF EXISTS themes CASCADE")
        conn.execute("DROP TABLE IF EXISTS sessions CASCADE")
        conn.execute("DROP TABLE IF EXISTS users CASCADE")
        conn.commit()


@unittest.skipUnless(TEST_DATABASE_URL, "TEST_DATABASE_URL is not set; skipping API contract tests.")
class ApiContractTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _reset_api_tables(TEST_DATABASE_URL)
        self.app = create_app(
            database_url=TEST_DATABASE_URL,
            dev_bearer_token="cheese",
            allow_insecure_apple_auth=True,
        )

    def _identity_token(self, label: str) -> str:
        return f"{label}-{uuid.uuid4().hex}"

    async def _sign_in(self, label: str, app=None) -> tuple[str, dict[str, str]]:
        target_app = self.app if app is None else app
        auth = await asgi_request(
            target_app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": self._identity_token(label)},
        )
        self.assertEqual(auth.status_code, 200)
        access_token = auth.json()["accessToken"]
        self.assertTrue(access_token)
        return access_token, {"authorization": f"Bearer {access_token}"}

    async def test_health_and_auth_required(self) -> None:
        health = await asgi_request(self.app, "GET", "/health")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["ok"])

        moods = await asgi_request(self.app, "GET", "/moods?year=2026")
        self.assertEqual(moods.status_code, 401)
        self.assertEqual(moods.json()["error"], "Missing Bearer token.")

    async def test_full_flow_for_user_session(self) -> None:
        access_token, headers = await self._sign_in("full-flow")

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

        patch_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={
                "bgColor": "112233",
                "moodColors": {"1": "#ffffff"},
                "shape": "square",
                "avoidLockScreenUi": True,
                "gridColumns": 20,
                "bgImageUrl": None,
            },
        )
        self.assertEqual(patch_theme.status_code, 200)
        theme = patch_theme.json()
        self.assertEqual(theme["bg_color"], "#112233")
        self.assertEqual(theme["mood_colors"]["1"], "#ffffff")
        self.assertEqual(theme["shape"], "square")
        self.assertTrue(theme["avoid_lock_screen_ui"])
        self.assertEqual(theme["columns"], 20)
        self.assertIsNone(theme["bg_image_url"])

        with psycopg.connect(TEST_DATABASE_URL) as conn:
            stored_theme_row = conn.execute(
                """
                SELECT themes.columns, themes.avoid_lock_screen_ui
                FROM themes
                JOIN sessions ON sessions.user_id = themes.user_id
                WHERE sessions.token = %s
                """,
                (access_token,),
            ).fetchone()
        self.assertIsNotNone(stored_theme_row)
        self.assertEqual(stored_theme_row[0], 20)
        self.assertEqual(stored_theme_row[1], 1)

        token_response = await asgi_request(self.app, "GET", "/token", headers=headers)
        self.assertEqual(token_response.status_code, 200)
        old_token = token_response.json()["token"]

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

    async def test_wallpaper_preview_applies_query_patch_without_persisting_theme(self) -> None:
        _, headers = await self._sign_in("preview")

        token_response = await asgi_request(self.app, "GET", "/token", headers=headers)
        self.assertEqual(token_response.status_code, 200)
        wallpaper_token = token_response.json()["token"]

        baseline_wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(baseline_wallpaper.status_code, 200)

        preview_wallpaper = await asgi_request(
            self.app,
            "GET",
            f"/w/{wallpaper_token}/preview?columns=21&avoidLockScreenUi=true",
        )
        self.assertEqual(preview_wallpaper.status_code, 200)
        self.assertEqual(preview_wallpaper.headers.get("content-type"), "image/png")
        self.assertIn("no-store", preview_wallpaper.headers.get("cache-control", ""))
        self.assertNotEqual(preview_wallpaper.body, baseline_wallpaper.body)

        theme_after_preview = await asgi_request(self.app, "GET", "/theme", headers=headers)
        self.assertEqual(theme_after_preview.status_code, 200)
        self.assertEqual(theme_after_preview.json()["columns"], DEFAULT_THEME["columns"])
        self.assertEqual(
            theme_after_preview.json()["avoid_lock_screen_ui"],
            DEFAULT_THEME["avoid_lock_screen_ui"],
        )

    async def test_auth_rate_limit_blocks_excessive_apple_sign_in_attempts(self) -> None:
        limited_app = create_app(
            database_url=TEST_DATABASE_URL,
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
            json_body={"identityToken": self._identity_token("rate-a")},
        )
        second = await asgi_request(
            limited_app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": self._identity_token("rate-b")},
        )
        third = await asgi_request(
            limited_app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": self._identity_token("rate-c")},
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.json()["error"], "Too many sign-in attempts. Try again later.")
        self.assertTrue(third.headers.get("retry-after"))

    async def test_session_rotation_returns_fresh_header_token(self) -> None:
        rotating_app = create_app(
            database_url=TEST_DATABASE_URL,
            dev_bearer_token="",
            allow_insecure_apple_auth=True,
            session_rotate_interval_seconds=60,
        )

        old_token, _ = await self._sign_in("rotate", app=rotating_app)

        old_created_at = (dt.datetime.now(dt.UTC) - dt.timedelta(minutes=5)).isoformat()
        with psycopg.connect(TEST_DATABASE_URL) as conn:
            conn.execute(
                "UPDATE sessions SET created_at = %s WHERE token = %s",
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
            database_url=TEST_DATABASE_URL,
            dev_bearer_token="",
            allow_insecure_apple_auth=True,
        )

        token, _ = await self._sign_in("expired", app=app)

        expired_at = (dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1)).isoformat()
        with psycopg.connect(TEST_DATABASE_URL) as conn:
            conn.execute("UPDATE sessions SET expires_at = %s WHERE token = %s", (expired_at, token))
            conn.commit()

        response = await asgi_request(app, "GET", "/theme", headers={"authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "Session expired. Sign in again.")

    async def test_wallpaper_cache_rejects_stale_revision(self) -> None:
        _, headers = await self._sign_in("stale-cache")

        token_response = await asgi_request(self.app, "GET", "/token", headers=headers)
        self.assertEqual(token_response.status_code, 200)
        wallpaper_token = token_response.json()["token"]

        with psycopg.connect(TEST_DATABASE_URL) as conn:
            row = conn.execute(
                "SELECT id, updated_at FROM users WHERE wallpaper_token = %s",
                (wallpaper_token,),
            ).fetchone()
            self.assertIsNotNone(row)
            user_id = str(row[0])
            old_revision = str(row[1])

        stale_bytes = b"not-a-real-png"
        set_cached_wallpaper(user_id, old_revision, stale_bytes)

        new_revision = (dt.datetime.now(dt.UTC) + dt.timedelta(seconds=1)).isoformat()
        with psycopg.connect(TEST_DATABASE_URL) as conn:
            conn.execute(
                "UPDATE users SET updated_at = %s WHERE id = %s",
                (new_revision, user_id),
            )
            conn.commit()

        wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(wallpaper.status_code, 200)
        self.assertNotEqual(wallpaper.body, stale_bytes)
        self.assertTrue(wallpaper.body.startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
