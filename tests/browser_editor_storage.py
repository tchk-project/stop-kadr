"""Exercise author-to-author transfer, simultaneous edits and the modal keyboard path."""
import json
import os
import random
import struct
import threading
import unittest
import zlib
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from browser_reliability import DOCS, QuietHandler


def png(seed):
    """A distinct, decodable 1.6 MB PNG, under the editor's individual limit."""
    width = height = 730
    pixels = random.Random(seed)
    rows = b"".join(b"\x00" + pixels.randbytes(3 * width) for _ in range(height))

    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))


def button(page, name):
    return page.get_by_role("button", name=name, exact=True)


def download(page):
    with page.expect_download() as download_event:
        button(page, "Скачать для передачи").click()
    return Path(download_event.value.path()).read_bytes()


def upload(page, contents):
    page.locator("#import-file").set_input_files({
        "name": "передача.stop-kadr.json", "mimeType": "application/json", "buffer": contents,
    })


def attach(page, index):
    button(page, "Добавить вложение").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("Выбрать файл").set_input_files({
        "name": f"кадр-{index}.png", "mimeType": "image/png", "buffer": png(index),
    })
    dialog.get_by_label("Текст голосового или описание").fill(f"Кадр {index}")
    button(dialog, "Добавить вложение").click()


class EditorStorageTest(unittest.TestCase):
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

    def editor(self):
        context = self.browser.new_context(viewport={"width": 390, "height": 844})
        self.addCleanup(context.close)
        page = context.new_page()
        page.goto(self.url)
        return page

    def new_story(self):
        page = self.editor()
        button(page, "Написать историю").click()
        page.get_by_label("Как называется история?").fill("Съёмка")
        button(page, "Начать писать").click()
        return page

    def test_transfer_size_recovery_and_undo(self):
        author = self.new_story()
        attach(author, 0)
        expect(author.locator("article .message img")).to_have_count(1)
        author.locator("summary", has_text="Действия с историей").click()
        button(author, "Отменить правку").click()
        empty = json.loads(download(author))
        self.assertFalse(empty.get("files"))
        self.assertFalse(empty["work"]["data"]["messages"])

        for index in range(7):
            attach(author, index)
            expect(author.locator("article .message img")).to_have_count(index + 1)
        attach(author, 7)
        dialog = author.get_by_role("dialog")
        expect(dialog.get_by_role("alert")).to_contain_text("16 МБ")
        expect(dialog.get_by_label("Текст голосового или описание")).to_have_value("Кадр 7")
        author.once("dialog", lambda confirm: confirm.accept())
        button(dialog, "Отмена").click()

        contents = download(author)
        self.assertGreater(len(contents), 12_000_000)
        self.assertLessEqual(len(contents), 16_000_000)
        recipient = self.editor()
        upload(recipient, contents)
        images = recipient.locator("article .message img")
        expect(images).to_have_count(7)
        self.assertTrue(images.evaluate_all("async imgs=>{await Promise.all(imgs.map(i=>i.decode()));return imgs.every(i=>i.naturalWidth===730)}"))
        self.assertEqual(json.loads(download(recipient)), json.loads(contents))

        # Older editors could produce arbitrarily large v1 files, with unreachable uploads.
        package = json.loads(contents)
        stale_path = next(iter(package["files"])).replace(".png", "-unused.png")
        package["files"][stale_path] = next(iter(package["files"].values()))
        legacy = json.dumps(package, ensure_ascii=False, indent=2).encode()
        self.assertGreater(len(legacy), 16_000_000)
        recovery = self.editor()
        upload(recovery, legacy)
        expect(recovery.locator("article .message img")).to_have_count(7)
        self.assertEqual(json.loads(download(recovery)), json.loads(contents))

        # Removing an attachment and undoing that removal must also restore its binary.
        first = recipient.locator("article .message").first
        first.locator("summary").click()
        button(first, "Убрать реплику").click()
        self.assertEqual(len(json.loads(download(recipient))["files"]), 6)
        recipient.locator("summary", has_text="Действия с историей").click()
        button(recipient, "Отменить правку").click()
        self.assertEqual(json.loads(download(recipient)), json.loads(contents))

    def test_removing_branch_prunes_its_last_attachment_and_undo_restores_it(self):
        page = self.new_story()
        page.locator(".open-choice").first.click()
        button(page, "＋ Добавить вариант ответа").click()
        page.get_by_label("Что выберет игрок?").fill("Отправлю снимок")
        button(page, "Сохранить").click()
        attach(page, 9)
        expect(page.locator("article .message img")).to_have_count(1)
        button(page, "＋ Добавить реплику").click()
        page.get_by_label("Реплика", exact=True).fill("Реплика только в удалённой ветке")
        button(page, "Сохранить").click()
        button(page, "Отметить как проверенное").click()
        button(page, "← К другим ответам").click()
        before = json.loads(download(page))
        page.once("dialog", lambda confirm: confirm.accept())
        button(page, "Убрать ветку").click()
        after = json.loads(download(page))
        self.assertFalse(after.get("files"))
        self.assertFalse(after["work"]["data"]["messages"])
        self.assertFalse(after["checked"])
        self.assertNotIn("Реплика только в удалённой ветке", json.dumps(after, ensure_ascii=False))
        page.locator("summary", has_text="Действия с историей").click()
        button(page, "Отменить правку").click()
        self.assertEqual(json.loads(download(page)), before)

    def test_empty_file_rejection_and_repair_of_older_package(self):
        page = self.new_story()
        button(page, "Добавить вложение").click()
        dialog = page.get_by_role("dialog")
        label = "На доске расписание"
        dialog.get_by_label("Текст голосового или описание").fill(label)
        file = dialog.get_by_label("Выбрать файл")
        file.set_input_files({"name": "empty.png", "mimeType": "image/png", "buffer": b""})
        button(dialog, "Добавить вложение").click()
        expect(dialog.get_by_role("alert")).to_contain_text("Файл пуст")
        expect(dialog.get_by_label("Текст голосового или описание")).to_have_value(label)
        expect(page.locator("article .message")).to_have_count(0)

        payload = {"name": "photo.png", "mimeType": "image/png", "buffer": png(1)}
        file.set_input_files(payload)
        button(dialog, "Добавить вложение").click()
        expect(page.locator("article .message img")).to_have_attribute("alt", label)
        original = json.loads(download(page))
        saved = json.loads(json.dumps(original))
        path = next(iter(saved["files"]))
        saved["files"][path] = "data:"

        recipient = self.editor()
        upload(recipient, json.dumps(saved, ensure_ascii=False).encode())
        warning = recipient.get_by_role("region", name="Пустые вложения")
        expect(warning).to_contain_text("описания сохранились")
        self.assertEqual(json.loads(download(recipient)), saved)
        recipient.reload()
        expect(warning.get_by_role("button", name=f"Заменить пустой файл · {label}")).to_be_visible()
        button(recipient, "Проверить историю").click()
        recipient.get_by_role("dialog").get_by_role("button", name=f"Замени пустой файл у вложения «{label}».", exact=False).click()
        repair = recipient.get_by_role("dialog")
        repair.get_by_label("Выбрать файл").set_input_files(payload)
        button(repair, "Заменить файл").click()
        expect(warning).to_have_count(0)
        image = recipient.locator("article .message img")
        self.assertEqual(image.evaluate("async img=>{await img.decode();return img.naturalWidth}"), 730)
        self.assertEqual(json.loads(download(recipient)), original)

    def test_live_channel_label_in_editor_and_reading_download(self):
        page = self.editor()
        page.get_by_role("button", name="Ещё один раунд", exact=False).click()
        label = "Реплика в голосовом канале"
        expect(page.locator("article .message").filter(has=page.locator("audio")).first).to_contain_text(label)
        button(page, "Добавить вложение").click()
        pick = page.get_by_role("dialog").get_by_role("combobox", name="Вложение", exact=True)
        expect(pick.locator("option").filter(has_text=label).first).to_contain_text(label)
        button(page.get_by_role("dialog"), "Отмена").click()
        page.locator("summary", has_text="Действия с историей").click()
        with page.expect_download() as event:
            button(page, "Скачать для вычитки").click()
        self.assertIn(f"({label})", Path(event.value.path()).read_text("utf-8-sig"))

    def test_separate_view_position_and_concurrent_edits(self):
        first = self.new_story()
        button(first, "＋ Добавить реплику").click()
        first.get_by_label("Реплика", exact=True).fill("Исходная реплика")
        button(first, "Сохранить").click()
        status = first.locator(".workhead small")
        expect(status).to_contain_text("Черновик сохранён")
        original_url = first.url
        second = first.context.new_page()
        second.goto(original_url)
        second.locator(".open-choice").first.click()
        second.reload()
        expect(button(second, "← К другим ответам")).to_be_visible()
        expect(status).to_contain_text("Черновик сохранён")

        # Hold the write lock to force a reload during the otherwise very short save window.
        guard = first.context.new_page()
        guard.goto(self.url)
        guard.evaluate("""() => {
          navigator.locks.request('stop-kadr.editor.v1.save',
            () => new Promise(resolve => window.releaseWrites = resolve));
        }""")
        guard.wait_for_function("typeof window.releaseWrites === 'function'")
        button(first, "Изменить реплику").click()
        first.get_by_label("Реплика", exact=True).fill("Сохранилось после перелистывания")
        button(first, "Сохранить").click()
        expect(status).to_contain_text("Сохраняем")
        first.reload()
        expect(first.locator("article .message")).to_contain_text("Сохранилось после перелистывания")
        guard.evaluate("window.releaseWrites()")
        expect(status).to_contain_text("Черновик сохранён")
        second.reload()
        button(second, "← К другим ответам").click()

        # Both dialogs have the same baseline while their authors are typing.
        for page, text in [(first, "Версия первого автора"), (second, "Версия второго автора")]:
            button(page, "Изменить реплику").click()
            page.get_by_label("Реплика", exact=True).fill(text)
        button(first, "Сохранить").click()
        button(second, "Сохранить").click()
        expect(second.locator(".workhead small")).to_contain_text("отдельной версией")
        self.assertEqual(first.url, original_url)
        self.assertNotEqual(first.url, second.url)
        for page, text in [(first, "Версия первого автора"), (second, "Версия второго автора")]:
            page.reload()
            expect(page.locator("article .message")).to_contain_text(text)
        button(second, "← Все истории").click()
        expect(second.get_by_role("button", name="Съёмка", exact=False)).to_have_count(2)

    def test_keyboard_focus_and_dirty_escape(self):
        page = self.new_story()
        expect(page.locator("#import-file")).to_be_hidden()
        button(page, "＋ Добавить реплику").press("Enter")
        dialog = page.get_by_role("dialog")
        channel = dialog.get_by_label("Где?")
        expect(dialog.get_by_label("Какой разговор?")).to_be_hidden()
        expect(dialog.get_by_label("Название для игрока")).to_be_hidden()
        channel.focus()
        page.keyboard.press("Tab")
        line = dialog.get_by_label("Реплика", exact=True)
        expect(line).to_be_focused()
        channel.select_option("+")
        expect(dialog.get_by_label("Название для игрока")).to_be_visible()
        channel.select_option("")
        line.fill("Сохранить эту реплику")
        page.once("dialog", lambda confirm: confirm.dismiss())
        page.keyboard.press("Escape")
        expect(line).to_have_value("Сохранить эту реплику")
        button(dialog, "Сохранить").press("Enter")
        edit = button(page, "Изменить реплику")
        expect(edit).to_be_focused()
        page.keyboard.press("Tab")
        expect(button(page, "Вставить перед")).to_be_focused()
        edit.press("Enter")
        line.fill("Отброшенный текст")
        page.once("dialog", lambda confirm: confirm.accept())
        page.keyboard.press("Escape")
        expect(dialog).to_be_hidden()
        expect(edit).to_be_focused()
        expect(page.locator("article .message p")).to_have_text("Сохранить эту реплику")


if __name__ == "__main__":
    unittest.main(verbosity=2)
