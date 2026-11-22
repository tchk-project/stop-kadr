"""Draft identity across browser history and checks against the current publication."""
import json
import os
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright

from browser_editor_storage import button, download, upload
from browser_reliability import DOCS, QuietHandler


class EditorHistoryTest(unittest.TestCase):
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
        context = self.browser.new_context()
        self.addCleanup(context.close)
        self.page = context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.url)

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def create_story(self):
        page = self.page
        button(page, "Написать историю").click()
        page.get_by_label("Как называется история?").fill("Черновик")
        button(page, "Начать писать").click()
        button(page, "＋ Добавить реплику").click()
        page.get_by_label("Реплика", exact=True).fill("Исходная реплика")
        button(page, "Сохранить").click()
        expect(page.locator(".workhead small")).to_contain_text("Черновик сохранён")

    def edit_line(self, text):
        button(self.page, "Изменить реплику").click()
        self.page.get_by_label("Реплика", exact=True).fill(text)

    def traverse(self, method, discard, destination):
        dialogs = []

        def answer(dialog):
            dialogs.append(dialog.message)
            if discard:
                dialog.accept()
            else:
                dialog.dismiss()

        self.page.once("dialog", answer)
        method()
        expect(self.page).to_have_url(destination)
        self.assertEqual(len(dialogs), 1)
        self.assertIn("Отбросить", dialogs[0])

    def test_back_and_forward_cannot_apply_a_form_to_another_draft(self):
        page = self.page
        self.create_story()
        original = page.url
        page.locator("summary", has_text="Действия с историей").click()
        button(page, "Создать копию").click()
        copy = page.url
        self.assertNotEqual(original, copy)
        self.edit_line("Правка в копии")
        self.traverse(page.go_back, False, copy)
        expect(page.get_by_label("Реплика", exact=True)).to_have_value("Правка в копии")
        button(page, "Сохранить").click()
        expect(page.locator(".workhead small")).to_contain_text("Черновик сохранён")
        page.go_back()
        expect(page.locator("article .message p")).to_have_text("Исходная реплика")
        self.edit_line("Отменённая правка")
        self.traverse(page.go_forward, False, original)
        expect(page.get_by_label("Реплика", exact=True)).to_have_value("Отменённая правка")
        self.traverse(page.go_forward, True, copy)
        expect(page.get_by_role("dialog")).to_be_hidden()
        expect(page.locator("article .message p")).to_have_text("Правка в копии")
        page.go_back()
        expect(page.locator("article .message p")).to_have_text("Исходная реплика")

    def test_catalog_direct_hash_and_clean_forms(self):
        page = self.page
        self.create_story()
        original = page.url
        self.edit_line("Сохранить после возврата")
        self.traverse(page.go_back, False, original)
        button(page, "Сохранить").click()
        expect(page.locator(".workhead small")).to_contain_text("Черновик сохранён")
        self.edit_line("Отбросить")
        self.traverse(lambda: page.evaluate("location.hash='missing'"), False, original)
        expect(page.get_by_label("Реплика", exact=True)).to_have_value("Отбросить")
        self.traverse(page.go_back, True, self.url)
        expect(page.locator("h1")).to_have_text("Редактор историй")
        expect(page.get_by_role("dialog")).to_be_hidden()
        page.go_forward()
        expect(page.locator("article .message p")).to_have_text("Сохранить после возврата")
        button(page, "Изменить реплику").click()
        page.go_back()
        expect(page.get_by_role("dialog")).to_be_hidden()
        expect(page.locator("h1")).to_have_text("Редактор историй")

    def test_cancel_full_page_exit_keeps_edit_and_confirms_on_retry(self):
        page = self.page
        self.create_story()
        source = page.url
        self.edit_line("Продолжаю в той же вкладке")
        prompts = []

        def stay(dialog):
            prompts.append(dialog.type)
            dialog.dismiss()

        page.once("dialog", stay)
        page.evaluate("location.assign('./index.html')")
        expect(page.get_by_label("Реплика", exact=True)).to_have_value("Продолжаю в той же вкладке")
        expect(page).to_have_url(source)
        self.assertEqual(prompts, ["beforeunload"])
        page.once("dialog", lambda dialog: dialog.accept())
        page.evaluate("location.assign('./index.html')")
        expect(page).to_have_url(self.url.replace("editor.html", "index.html"))
        page.goto(source)
        expect(page.locator("article .message p")).to_have_text("Исходная реплика")

    def test_jump_between_visits_to_same_draft_with_history_api(self):
        page = self.page
        page.add_init_script("Object.defineProperty(window, 'navigation', {value: undefined})")
        page.reload()
        self.create_story()
        source = page.url
        first_entry = page.evaluate("history.state.editorPosition")
        button(page, "← Все истории").click()
        page.get_by_role("button", name="Черновик Продолжить", exact=False).click()
        self.edit_line("Сохранить в первом посещении")
        page.evaluate("history.go(-2)")
        page.wait_for_function("i => history.state.editorPosition === i", arg=first_entry)
        self.traverse(page.go_back, False, source)
        self.assertEqual(page.evaluate("history.state.editorPosition"), first_entry)
        self.traverse(page.go_forward, True, self.url)
        expect(page.locator("h1")).to_have_text("Редактор историй")

    def test_saved_base_is_checked_after_reopening_reloading_and_reconnecting(self):
        page = self.page
        page.get_by_role("button", name="Кот под голосовым", exact=False).click()
        expect(page.locator(".workhead small")).to_contain_text("Черновик сохранён")
        button(page, "← Все истории").click()
        catalog_url = "**/game/catalog.js"
        catalog = (DOCS / "game/catalog.js").read_text()
        updated = catalog.replace("Кот под голосовым", "Другая публикация")
        page.route(catalog_url, lambda route: route.fulfill(body=updated))
        page.get_by_role("button", name="Кот под голосовым Продолжить", exact=False).click()
        banner = page.locator('[data-base-status="draft"]')
        check = page.locator('[data-base-status="inspect"]')
        expect(banner).to_contain_text("Опубликованная история уже изменилась")
        page.reload()
        expect(banner).to_contain_text("Опубликованная история уже изменилась")
        button(page, "Проверить историю").last.click()
        expect(check).to_contain_text("Опубликованная история уже изменилась")
        button(page, "Вернуться к тексту").click()

        page.unroute(catalog_url)
        page.route(catalog_url, lambda route: route.abort())
        page.reload()
        expect(banner).to_contain_text("Не удалось сверить")
        button(page, "Проверить историю").last.click()
        expect(check).to_contain_text("Не удалось сверить")
        button(page, "Вернуться к тексту").click()
        page.unroute(catalog_url)
        button(page, "Проверить историю").last.click()
        expect(check).to_contain_text("совпадает")
        expect(banner).to_be_hidden()
        button(page, "Вернуться к тексту").click()
        page.route(catalog_url, lambda route: route.fulfill(body="const allStories = [];"))
        button(page, "Проверить историю").last.click()
        expect(check).to_contain_text("Истории больше нет")

    def test_late_check_cannot_replace_newer_check(self):
        page = self.page
        page.get_by_role("button", name="Кот под голосовым", exact=False).click()
        expect(page.locator(".workhead small")).to_contain_text("Черновик сохранён")
        requests = []
        catalog_url = "**/game/catalog.js"
        page.route(catalog_url, lambda route: requests.append(route) if not requests else route.continue_())
        with page.expect_request(catalog_url):
            button(page, "Проверить историю").last.click()
        status = page.locator('[data-base-status="inspect"]')
        expect(status).to_contain_text("Сверяем")
        button(page, "Вернуться к тексту").click()
        button(page, "Проверить историю").last.click()
        expect(status).to_contain_text("совпадает")
        requests[0].fulfill(body="const allStories = [];")
        page.wait_for_load_state("networkidle")
        expect(status).to_contain_text("совпадает")

    def test_imported_base_detects_changed_text_independently_of_json_key_order(self):
        page = self.page
        page.get_by_role("button", name="Кот под голосовым", exact=False).click()
        package = json.loads(download(page))
        button(page, "← Все истории").click()
        upload(page, json.dumps(package, sort_keys=True).encode())
        button(page, "Проверить историю").last.click()
        status = page.locator('[data-base-status="inspect"]')
        expect(status).to_contain_text("совпадает")
        button(page, "Вернуться к тексту").click()
        published = package["base"]["data"]
        first_line = next(line for line in published["messages"].values() if "text" in line)
        first_line["text"] += " Добавлена реплика."
        page.route("**/game/stories/sticker.js", lambda route: route.fulfill(
            body="const storyData = " + json.dumps(published) + ";"))
        button(page, "Проверить историю").last.click()
        expect(status).to_contain_text("Опубликованная история уже изменилась")


if __name__ == "__main__":
    unittest.main(verbosity=2)
