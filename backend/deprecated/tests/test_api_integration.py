from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.main import create_app

from asgi_client import asgi_request


class ApiIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "integration.db"
        self.app = create_app(
            database_path=self.db_path,
            dev_bearer_token="cheese",
            allow_insecure_apple_auth=True,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    async def sign_in(self, identity_token: str) -> dict[str, str]:
        response = await asgi_request(
            self.app,
            "POST",
            "/auth/apple",
            json_body={"identityToken": identity_token},
        )
        self.assertEqual(response.status_code, 200)
        token = response.json()["accessToken"]
        return {"authorization": f"Bearer {token}"}

    async def test_data_persists_across_app_restart(self) -> None:
        headers = await self.sign_in("restart-token")

        save_mood = await asgi_request(
            self.app,
            "PUT",
            "/moods/2026-02-20",
            headers=headers,
            json_body={"level": 5, "note": "before restart"},
        )
        self.assertEqual(save_mood.status_code, 200)

        save_theme = await asgi_request(
            self.app,
            "PUT",
            "/theme",
            headers=headers,
            json_body={"bgColor": "334455", "shape": "square"},
        )
        self.assertEqual(save_theme.status_code, 200)

        token_before = await asgi_request(self.app, "GET", "/token", headers=headers)
        self.assertEqual(token_before.status_code, 200)
        wallpaper_token = token_before.json()["token"]

        restarted_app = create_app(
            database_path=self.db_path,
            dev_bearer_token="cheese",
            allow_insecure_apple_auth=True,
        )

        moods_after_restart = await asgi_request(restarted_app, "GET", "/moods?year=2026", headers=headers)
        self.assertEqual(moods_after_restart.status_code, 200)
        self.assertEqual(
            moods_after_restart.json()["moods"],
            [{"date": "2026-02-20", "level": 5, "note": "before restart"}],
        )

        theme_after_restart = await asgi_request(restarted_app, "GET", "/theme", headers=headers)
        self.assertEqual(theme_after_restart.status_code, 200)
        self.assertEqual(theme_after_restart.json()["bg_color"], "#334455")
        self.assertEqual(theme_after_restart.json()["shape"], "square")

        token_after = await asgi_request(restarted_app, "GET", "/token", headers=headers)
        self.assertEqual(token_after.status_code, 200)
        self.assertEqual(token_after.json()["token"], wallpaper_token)

    async def test_moods_year_filter_and_note_truncation(self) -> None:
        headers = await self.sign_in("year-filter-token")
        very_long_note = "x" * 300

        mood_2025 = await asgi_request(
            self.app,
            "PUT",
            "/moods/2025-12-31",
            headers=headers,
            json_body={"level": 2, "note": very_long_note},
        )
        self.assertEqual(mood_2025.status_code, 200)
        self.assertEqual(len(mood_2025.json()["note"]), 240)

        mood_2026 = await asgi_request(
            self.app,
            "PUT",
            "/moods/2026-01-01",
            headers=headers,
            json_body={"level": 3},
        )
        self.assertEqual(mood_2026.status_code, 200)

        moods_2026 = await asgi_request(self.app, "GET", "/moods?year=2026", headers=headers)
        self.assertEqual(moods_2026.status_code, 200)
        self.assertEqual(moods_2026.json()["moods"], [{"date": "2026-01-01", "level": 3}])

        moods_2025 = await asgi_request(self.app, "GET", "/moods?year=2025", headers=headers)
        self.assertEqual(moods_2025.status_code, 200)
        self.assertEqual(len(moods_2025.json()["moods"]), 1)
        self.assertEqual(moods_2025.json()["moods"][0]["date"], "2025-12-31")
        self.assertEqual(len(moods_2025.json()["moods"][0]["note"]), 240)

        invalid_year = await asgi_request(self.app, "GET", "/moods?year=1999", headers=headers)
        self.assertEqual(invalid_year.status_code, 400)

    async def test_sessions_are_user_isolated(self) -> None:
        user_a_headers = await self.sign_in("isolation-a")
        user_b_headers = await self.sign_in("isolation-b")

        write_a = await asgi_request(
            self.app,
            "PUT",
            "/moods/2026-03-01",
            headers=user_a_headers,
            json_body={"level": 4, "note": "private"},
        )
        self.assertEqual(write_a.status_code, 200)

        read_b = await asgi_request(self.app, "GET", "/moods?year=2026", headers=user_b_headers)
        self.assertEqual(read_b.status_code, 200)
        self.assertEqual(read_b.json()["moods"], [])

        delete_b = await asgi_request(self.app, "DELETE", "/moods/2026-03-01", headers=user_b_headers)
        self.assertEqual(delete_b.status_code, 204)

        read_a = await asgi_request(self.app, "GET", "/moods?year=2026", headers=user_a_headers)
        self.assertEqual(read_a.status_code, 200)
        self.assertEqual(
            read_a.json()["moods"],
            [{"date": "2026-03-01", "level": 4, "note": "private"}],
        )

    async def test_logout_and_login_with_same_apple_identity_preserves_data(self) -> None:
        first_headers = await self.sign_in("stable-apple-identity")

        save = await asgi_request(
            self.app,
            "PUT",
            "/moods/2026-04-02",
            headers=first_headers,
            json_body={"level": 5, "note": "carry forward"},
        )
        self.assertEqual(save.status_code, 200)

        logout = await asgi_request(self.app, "DELETE", "/auth/session", headers=first_headers)
        self.assertEqual(logout.status_code, 204)

        old_session_read = await asgi_request(self.app, "GET", "/moods?year=2026", headers=first_headers)
        self.assertEqual(old_session_read.status_code, 401)

        second_headers = await self.sign_in("stable-apple-identity")
        restored = await asgi_request(self.app, "GET", "/moods?year=2026", headers=second_headers)
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(
            restored.json()["moods"],
            [{"date": "2026-04-02", "level": 5, "note": "carry forward"}],
        )


if __name__ == "__main__":
    unittest.main()
