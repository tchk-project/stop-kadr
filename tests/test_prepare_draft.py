import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import prepare_draft as editor


class PrepareDraftTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = editor.current("sticker")

    def package(self):
        return {"format": "stop-kadr-draft/1", "base": copy.deepcopy(self.original),
                "work": copy.deepcopy(self.original)}

    def test_changed_baseline_stops_before_export(self):
        package = self.package()
        package["base"]["meta"]["title"] = "Более раннее название"
        with patch.object(editor, "current", return_value=self.original):
            with self.assertRaisesRegex(ValueError, "изменилась"):
                editor.prepare(package)

    def test_diff_and_yaml_export_only_into_new_external_folder(self):
        package = self.package()
        package["work"]["meta"]["title"] = "Исправленное название"
        with tempfile.TemporaryDirectory() as temp, patch.object(editor, "current", return_value=self.original):
            dest = Path(temp) / "reviewed"
            summary = editor.prepare(package, dest)
            self.assertIn("Исправленное название", summary)
            self.assertTrue((dest / "self.yaml").is_file())
            with self.assertRaises(ValueError):
                editor.prepare(package, dest)
            with self.assertRaises(ValueError):
                editor.prepare(package, editor.game.ROOT / "stories" / "sticker")

    def test_legacy_unreachable_message_is_absent_from_diff_and_yaml(self):
        package = self.package()
        text = "Удалённая авторская реплика"
        package["work"]["data"]["messages"]["removed"] = {"speaker": "Ты", "text": text}
        with tempfile.TemporaryDirectory() as temp, patch.object(editor, "current", return_value=self.original):
            dest = Path(temp) / "reviewed"
            self.assertEqual(editor.prepare(package, dest), "")
            self.assertNotIn(text, (dest / "messages.yaml").read_text("utf8"))

    def test_legacy_empty_file_has_a_repair_instruction(self):
        package = self.package()
        data = package["work"]["data"]
        path = "./game/media/sticker/empty.png"
        data["messages"]["empty"] = {"speaker": "Ты", "media": {"kind": "image", "src": path, "alt": "Описание"}}
        data["routes"]["self"]["scenes"]["start"]["messages"].append("empty")
        package["files"] = {path: "data:"}
        with tempfile.TemporaryDirectory() as temp, patch.object(editor, "current", return_value=self.original):
            dest = Path(temp) / "reviewed"
            with self.assertRaisesRegex(ValueError, "замените файл"):
                editor.prepare(package, dest)
            self.assertFalse(dest.exists())
