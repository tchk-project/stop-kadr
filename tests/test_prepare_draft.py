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
