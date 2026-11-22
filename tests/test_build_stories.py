import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_stories as build


class AuthoringTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        docs = self.root / "docs"
        self.folder = self.root / "stories" / "new-story"
        self.folder.mkdir(parents=True)
        docs.mkdir()
        self.enterContext(patch.multiple(build, ROOT=self.root, DOCS=docs, OUTPUT=docs / "game"))
        (self.folder / "story.yaml").write_text("""
id: new-story
title: New story
place: School
roles:
  witness: {name: Kim, intro: In class, viewpoint: Kim}
  self: {name: Sam, intro: At school, viewpoint: Sam}
cast: [Kim, Sam]
channels: {main: {kind: group, title: Class}}
""", encoding="utf8")
        (self.folder / "messages.yaml").write_text("""
hi: {speaker: Kim, channel: main, text: 'A [[first]] message.'}
more: {speaker: Sam, text: '[[Another]] message.'}
""", encoding="utf8")
        self.route = """
scenes:
  start: {mode: yellow, messages: [hi], choices: {calm: Calm, pressure: Pressure}}
  calm: {mode: yellow, messages: [more], outcome: [positive, Done], note: End}
  pressure:
    mode: orange
    messages: [more]
    outcome: [open, Done]
    note: End
    review: {effect: Consider the message, signals: [start/hi]}
cues: {start/hi: The first detail}
"""
        for role in build.ROLES:
            (self.folder / (role + ".yaml")).write_text(self.route, encoding="utf8")

    def test_folder_alone_generates_catalog_and_playable_story(self):
        scripts = build.build()
        self.assertIn(b"new-story", scripts[build.OUTPUT / "catalog.js"])
        self.assertIn(b"first", scripts[build.OUTPUT / "stories/new-story.js"])

    def test_signal_from_another_take_is_rejected(self):
        (self.folder / "self.yaml").write_text(self.route.replace("start/hi", "calm/more"), encoding="utf8")
        with self.assertRaisesRegex(ValueError, "new-story: self: pressure"):
            build.build()

    def test_duplicate_message_and_missing_destination_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Repeated YAML key"):
            build.yaml.load("hi: 1\nhi: 2", Loader=build.StoryLoader)
        (self.folder / "self.yaml").write_text(self.route.replace("pressure: Pressure", "absent: Pressure"), encoding="utf8")
        with self.assertRaisesRegex(ValueError, "first takes"):
            build.build()

    def test_story_media_is_copied_and_missing_assets_fail(self):
        (self.folder / "messages.yaml").write_text((self.folder / "messages.yaml").read_text("utf8") +
            "\naudio: {speaker: Kim, media: {kind: voice, src: media/test.mp3, transcript: Hello}}", encoding="utf8")
        with self.assertRaisesRegex(ValueError, "media/test.mp3"):
            build.build()
        (self.folder / "media").mkdir()
        (self.folder / "media/test.mp3").write_bytes(b"sample")
        output = build.build()
        self.assertEqual(output[build.OUTPUT / "media/new-story/test.mp3"], b"sample")
