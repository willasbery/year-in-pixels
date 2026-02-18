from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.main import create_app

from asgi_client import asgi_request


class ApiContractTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_path = Path(self.temp_dir.name) / "test-data.json"
        self.app = create_app(data_path=self.data_path, dev_bearer_token="cheese")

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


if __name__ == "__main__":
    unittest.main()
