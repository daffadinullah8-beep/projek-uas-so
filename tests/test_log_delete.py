import asyncio
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SERVER_PATH = Path(__file__).resolve().parents[1] / "server" / "server.py"
SPEC = importlib.util.spec_from_file_location("aether_test_log_server", SERVER_PATH)
backend = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = backend
SPEC.loader.exec_module(backend)


class LogDeleteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.logs = Path(self.temp.name)
        self.previous_logs = backend.LOGS
        self.previous_sessions = backend._sessions.copy()
        backend.LOGS = self.logs
        backend._sessions.clear()

    def tearDown(self):
        backend.LOGS = self.previous_logs
        backend._sessions.clear()
        backend._sessions.update(self.previous_sessions)
        self.temp.cleanup()

    def test_delete_removes_csv_and_json_metadata(self):
        directory = self.logs / "saved-session"
        directory.mkdir()
        (directory / "samples.csv").write_text("cpu_temp_c\n60\n")
        (directory / "meta.json").write_text(json.dumps({"id": 123}))
        (directory / "123.meta.json").write_text(json.dumps({"extra": True}))

        response = asyncio.run(backend.log_delete("123"))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(directory.exists())

    def test_delete_accepts_dot_meta_json(self):
        directory = self.logs / "dot-meta-session"
        directory.mkdir()
        (directory / "samples.csv").write_text("cpu_temp_c\n60\n")
        (directory / "456.meta.json").write_text(json.dumps({"id": 456}))

        response = asyncio.run(backend.log_delete("456"))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(directory.exists())

    def test_delete_waits_for_recorder_to_release_files(self):
        directory = self.logs / "recorded-session"
        directory.mkdir()
        csv_path = directory / "samples.csv"
        csv_path.write_text("cpu_temp_c\n60\n")
        session_id = 456

        async def delete_after_recording():
            async def finish_recording():
                await asyncio.sleep(0.01)
                (directory / "meta.json").write_text(json.dumps({"id": session_id}))

            task = asyncio.create_task(finish_recording())
            backend._sessions[session_id] = {
                "id": session_id,
                "rec": False,
                "dir": directory,
                "task": task,
            }
            return await backend.log_delete(str(session_id))

        response = asyncio.run(delete_after_recording())

        self.assertEqual(response.status_code, 200)
        self.assertFalse(directory.exists())

    def test_delete_retries_windows_file_lock(self):
        directory = self.logs / "locked-session"
        directory.mkdir()
        (directory / "samples.csv").write_text("cpu_temp_c\n60\n")
        (directory / "meta.json").write_text(json.dumps({"id": 789}))
        remove = backend.shutil.rmtree
        attempts = 0

        def delayed_remove(path):
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise PermissionError("file is temporarily locked")
            remove(path)

        async def remove_locked_session():
            with patch.object(backend.os, "name", "nt"):
                return await backend.log_delete("789")

        with patch.object(backend.shutil, "rmtree", side_effect=delayed_remove):
            response = asyncio.run(remove_locked_session())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(attempts, 3)
        self.assertFalse(directory.exists())

    def test_cannot_delete_a_recording_session(self):
        directory = self.logs / "active-session"
        directory.mkdir()
        (directory / "samples.csv").write_text("cpu_temp_c\n60\n")
        backend._sessions[321] = {
            "id": 321,
            "rec": True,
            "dir": directory,
        }

        response = asyncio.run(backend.log_delete("321"))

        self.assertEqual(response.status_code, 409)
        self.assertTrue(directory.exists())


if __name__ == "__main__":
    unittest.main()
