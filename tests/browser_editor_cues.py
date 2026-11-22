"""Exercise cited text through the editor, player preview and release preparation."""
import json
import os
import re
import subprocess
import sys
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from browser_reliability import DOCS, QuietHandler


class EditorCuesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=DOCS))
        cls.addClassCleanup(server.server_close)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.addClassCleanup(server.shutdown)
        cls.url = f"http://127.0.0.1:{server.server_port}/editor.html"
        playwright = sync_playwright().start()
        cls.addClassCleanup(playwright.stop)
        cls.browser = playwright.chromium.launch(executable_path=os.getenv("CHROMIUM_EXECUTABLE_PATH"))
        cls.addClassCleanup(cls.browser.close)

    def setUp(self):
        context = self.browser.new_context(reduced_motion="reduce", viewport={"width": 390, "height": 844})
        self.addCleanup(context.close)
        self.page = context.new_page()
        self.page.goto(self.url)

    def click(self, name):
        self.page.get_by_role("button", name=name, exact=True).click()

    def open_story(self, name):
        self.page.get_by_role("button", name=re.compile(name)).click()
        self.page.locator("#read-as").select_option("witness")

    def download(self, name):
        with self.page.expect_download() as event:
            self.click(name)
        return Path(event.value.path())

    def check_release(self):
        package = self.download("Скачать для передачи")
        result = subprocess.run([sys.executable, "scripts/prepare_draft.py", str(package)],
                                cwd=DOCS.parent, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def link_to_review(self, phrase):
        self.page.locator("summary", has_text="Что увидит игрок").click()
        self.click("Изменить разбор")
        self.page.get_by_role("checkbox", name=re.compile(re.escape("«" + phrase + "»"))).check()
        self.click("Сохранить")
        self.page.locator("summary", has_text="Что увидит игрок").click()
        expect(self.page.locator("details[open].reviewbox")).to_contain_text("«" + phrase + "»")

    def test_edit_choice_quote_through_player_review_and_release(self):
        self.open_story("Сбор после уроков")
        self.click("Читать дальше →")
        self.page.locator(".choice", has_text="Закрою чат").get_by_text("Изменить ответ").click()
        self.page.get_by_label("Что выберет игрок?").fill("Отложу телефон")
        self.click("Сохранить")
        expect(self.page.locator("#sheet [role=alert]")).to_contain_text("нет в новом тексте")
        self.page.get_by_label("Фраза для разбора").fill("телефон")
        self.page.get_by_label("Что в этой фразе важно?").fill("Саша продолжает ждать ответа.")
        self.click("Сохранить")
        self.click("Отложу телефон →")
        self.page.locator(".open-choice", has_text="Уберу телефон").click()
        self.link_to_review("телефон")
        self.click("Проверить в игре")
        game = self.page.frame_locator("#preview iframe")
        game.get_by_role("button", name="Что можно было сделать иначе?").click()
        expect(game.locator('[data-ref="ignore/@choice"] mark')).to_have_count(0)
        game.get_by_role("button", name="Дальше", exact=True).click()
        expect(game.locator(".signal-list")).to_contain_text("«телефон» — Саша продолжает ждать ответа.")
        expect(game.locator('[data-ref="ignore/@choice"] mark')).to_have_text("телефон")
        expect(game.locator('[data-ref="silence/@choice"] mark')).to_have_count(0)
        self.click("Вернуться к тексту")
        self.check_release()

    def test_unmarked_answer_in_older_file_opens_the_exact_answer_from_check(self):
        self.open_story("Сбор после уроков")
        data = json.loads(self.download("Скачать для передачи").read_text())
        data["work"]["data"]["routes"]["witness"]["scenes"]["pressure"]["choices"]["ignore"] = "Отложу телефон"
        self.click("← Все истории")
        self.page.locator("#import-file").set_input_files({
            "name": "older.stop-kadr.json", "mimeType": "application/json", "buffer": json.dumps(data).encode()
        })
        self.click("Проверить историю")
        self.page.get_by_role("button", name=re.compile("Снова выдели фразу для разбора в ответе «Отложу телефон»")).click()
        expect(self.page.get_by_label("Что выберет игрок?")).to_have_value("Отложу телефон")
        self.page.get_by_label("Фраза для разбора").fill("телефон")
        self.click("Сохранить")
        self.click("Проверить историю")
        expect(self.page.locator("#sheet")).to_contain_text("У обеих ролей заполнены")

    def test_sticker_description_and_reading_copy(self):
        self.open_story("Кот под голосовым")
        self.page.locator("summary", has_text="Действия с историей").click()
        txt = self.download("Скачать для вычитки").read_text(encoding="utf-8-sig")
        for reply in ["На голосовое Леры", "На твоё голосовое"]:
            for reactions in ["😅 Миша, Костя", "😕 Аня"]:
                self.assertIn(reply + "\nРеакции · " + reactions, txt)
        sticker = self.page.locator(".group .message", has_text="Сонный рыжий кот").first
        sticker.get_by_role("button", name="Изменить реплику").click()
        self.page.get_by_label("Фраза для разбора").fill("УСНУЛ")
        self.page.get_by_label("Что в этой фразе важно?").fill("Даня отвечает стикером на голосовое.")
        self.click("Сохранить")
        self.click("Читать дальше →")
        self.page.locator(".open-choice", has_text="За котом потерялся вопрос").click()
        self.link_to_review("УСНУЛ")
        self.click("Проверить в игре")
        game = self.page.frame_locator("#preview iframe")
        game.get_by_role("button", name="Какие детали мне помогли?").click()
        expect(game.locator(".signal-list")).to_contain_text("«УСНУЛ» — Даня отвечает стикером на голосовое.")
        row = game.locator("[data-ref]:has(.sticker .cue-words)")
        expect(row.locator(".cue-words mark")).to_have_text("УСНУЛ")
        expect(row.locator(".sticker img")).to_have_attribute("alt", "Сонный рыжий кот в наушниках. Надпись «УСНУЛ».")
        self.click("Вернуться к тексту")
        self.check_release()
