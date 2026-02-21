from __future__ import annotations

import datetime as dt
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.cache import set_cached_wallpaper
from app.constants import DEFAULT_THEME
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

        with sqlite3.connect(self.data_path) as conn:
            stored_theme_row = conn.execute(
                """
                SELECT themes.columns, themes.avoid_lock_screen_ui
                FROM themes
                JOIN sessions ON sessions.user_id = themes.user_id
                WHERE sessions.token = ?
                """,
                (access_token,),
            ).fetchone()
        self.assertIsNotNone(stored_theme_row)
        self.assertEqual(stored_theme_row[0], 20)
        self.assertEqual(stored_theme_row[1], 1)

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

    async def test_theme_update_invalidates_wallpaper_and_disables_client_caching(self) -> None:
        auth = await asgi_request(
            self.app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-cache"},
        )
        self.assertEqual(auth.status_code, 200)
        headers = {"authorization": f"Bearer {auth.json()['accessToken']}"}

        token_response = await asgi_request(self.app, "GET", "/token", headers=headers)
        self.assertEqual(token_response.status_code, 200)
        wallpaper_token = token_response.json()["token"]

        first_wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(first_wallpaper.status_code, 200)
        self.assertIn("no-store", first_wallpaper.headers.get("cache-control", ""))

        update_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={"columns": 21},
        )
        self.assertEqual(update_theme.status_code, 200)

        second_wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(second_wallpaper.status_code, 200)
        self.assertNotEqual(first_wallpaper.body, second_wallpaper.body)

    async def test_wallpaper_preview_applies_query_patch_without_persisting_theme(self) -> None:
        auth = await asgi_request(
            self.app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-preview"},
        )
        self.assertEqual(auth.status_code, 200)
        headers = {"authorization": f"Bearer {auth.json()['accessToken']}"}

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

    async def test_invalid_columns_are_ignored(self) -> None:
        auth = await asgi_request(
            self.app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-columns"},
        )
        self.assertEqual(auth.status_code, 200)
        access_token = auth.json()["accessToken"]
        headers = {"authorization": f"Bearer {access_token}"}

        first_update = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={"columns": 18},
        )
        self.assertEqual(first_update.status_code, 200)
        self.assertEqual(first_update.json()["columns"], 18)

        invalid_update = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={"columns": 100},
        )
        self.assertEqual(invalid_update.status_code, 200)
        self.assertEqual(invalid_update.json()["columns"], 18)

    async def test_wallpaper_updates_for_shape_gap_and_theme_variants(self) -> None:
        auth = await asgi_request(
            self.app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-style-variants"},
        )
        self.assertEqual(auth.status_code, 200)
        headers = {"authorization": f"Bearer {auth.json()['accessToken']}"}

        mood_response = await asgi_request(
            self.app,
            "PUT",
            "/moods/2026-02-20",
            headers=headers,
            json_body={"level": 3},
        )
        self.assertEqual(mood_response.status_code, 200)

        token_response = await asgi_request(self.app, "GET", "/token", headers=headers)
        self.assertEqual(token_response.status_code, 200)
        wallpaper_token = token_response.json()["token"]

        baseline_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={
                "bgColor": "0d1117",
                "shape": "rounded",
                "spacing": "medium",
                "avoidLockScreenUi": False,
                "columns": 14,
                "moodColors": {"3": "33cc99"},
            },
        )
        self.assertEqual(baseline_theme.status_code, 200)
        baseline_wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(baseline_wallpaper.status_code, 200)
        baseline_bytes = baseline_wallpaper.body

        shape_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={"shape": "square"},
        )
        self.assertEqual(shape_theme.status_code, 200)
        shape_wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(shape_wallpaper.status_code, 200)
        self.assertNotEqual(shape_wallpaper.body, baseline_bytes)

        gap_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={"shape": "rounded", "spacing": "wide"},
        )
        self.assertEqual(gap_theme.status_code, 200)
        gap_wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(gap_wallpaper.status_code, 200)
        self.assertNotEqual(gap_wallpaper.body, baseline_bytes)

        avoid_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={"avoidLockScreenUi": True},
        )
        self.assertEqual(avoid_theme.status_code, 200)
        self.assertTrue(avoid_theme.json()["avoid_lock_screen_ui"])
        avoid_wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(avoid_wallpaper.status_code, 200)
        self.assertNotEqual(avoid_wallpaper.body, baseline_bytes)
        self.assertNotEqual(avoid_wallpaper.body, gap_wallpaper.body)

        color_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={"bgColor": "1f1535", "moodColors": {"3": "ff4fd8"}},
        )
        self.assertEqual(color_theme.status_code, 200)
        color_wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(color_wallpaper.status_code, 200)
        self.assertNotEqual(color_wallpaper.body, baseline_bytes)
        self.assertNotEqual(color_wallpaper.body, gap_wallpaper.body)
        self.assertNotEqual(color_wallpaper.body, avoid_wallpaper.body)

    async def test_wallpaper_cache_rejects_stale_revision(self) -> None:
        auth = await asgi_request(
            self.app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": "token-stale-cache"},
        )
        self.assertEqual(auth.status_code, 200)
        headers = {"authorization": f"Bearer {auth.json()['accessToken']}"}

        token_response = await asgi_request(self.app, "GET", "/token", headers=headers)
        self.assertEqual(token_response.status_code, 200)
        wallpaper_token = token_response.json()["token"]

        with sqlite3.connect(self.data_path) as conn:
            row = conn.execute(
                "SELECT id, updated_at FROM users WHERE wallpaper_token = ?",
                (wallpaper_token,),
            ).fetchone()
            self.assertIsNotNone(row)
            user_id = str(row[0])
            old_revision = str(row[1])

        stale_bytes = b"not-a-real-png"
        set_cached_wallpaper(user_id, old_revision, stale_bytes)

        new_revision = (dt.datetime.now(dt.UTC) + dt.timedelta(seconds=1)).isoformat()
        with sqlite3.connect(self.data_path) as conn:
            conn.execute(
                "UPDATE users SET updated_at = ? WHERE id = ?",
                (new_revision, user_id),
            )
            conn.commit()

        wallpaper = await asgi_request(self.app, "GET", f"/w/{wallpaper_token}")
        self.assertEqual(wallpaper.status_code, 200)
        self.assertNotEqual(wallpaper.body, stale_bytes)
        self.assertTrue(wallpaper.body.startswith(b"\x89PNG\r\n\x1a\n"))

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
