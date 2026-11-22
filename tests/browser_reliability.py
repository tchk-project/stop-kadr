"""Run with python tests/browser_reliability.py after installing Playwright Chromium."""
import os
import re
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import expect, sync_playwright


DOCS = Path(__file__).resolve().parents[1] / "docs"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class BrowserReliabilityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=DOCS))
        cls.addClassCleanup(server.server_close)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.addClassCleanup(server.shutdown)
        cls.base = f"http://127.0.0.1:{server.server_port}/"
        playwright = sync_playwright().start()
        cls.addClassCleanup(playwright.stop)
        cls.browser = playwright.chromium.launch(executable_path=os.getenv("CHROMIUM_EXECUTABLE_PATH"))
        cls.addClassCleanup(cls.browser.close)

    def setUp(self):
        context = self.browser.new_context(reduced_motion="reduce", viewport={"width": 390, "height": 844})
        self.addCleanup(context.close)
        self.page = context.new_page()

    def retry(self, failed_asset, *, url=None):
        """Interrupt one resource, then restore it and retry using the visible control."""
        page = self.page
        page.route(failed_asset, lambda route: route.abort())
        if url:
            page.goto(url)
        else:
            page.reload()
        button = page.get_by_role("button", name="Повторить загрузку")
        expect(button).to_be_visible()
        failed_url = page.url
        page.unroute(failed_asset)
        with page.expect_navigation(wait_until="load"):
            button.click()
        expect(page).to_have_url(failed_url)

    def test_reader_follows_the_choice_and_shows_only_prior_signals(self):
        page = self.page
        page.goto(self.base + "read-story.html?case=money#witness-pressure")
        choice = page.locator('#witness-pressure a[href="#witness-pay"]')
        choice.click()
        expect(page).to_have_url(re.compile(r"#witness-pay$"))
        result = page.locator("#witness-pay")
        expect(result).to_contain_text("Я просил со мной выйти")
        cue = result.locator(".review a").last
        cue.click()
        expect(page.locator(":target")).to_contain_text("Побудешь со мной")
        page.locator("select").select_option("rumour")
        page.get_by_role("button", name="Открыть").click()
        expect(page.locator("#self")).to_be_visible()
        expect(page.get_by_role("heading", level=1)).to_have_text("Скрин в личке")

    def test_home_retry(self):
        self.retry("**/catalog-home.js*", url=self.base + "index.html")
        expect(self.page.get_by_role("button", name="Играть")).to_be_visible()
        self.page.get_by_role("button", name="Играть").click()
        expect(self.page.locator(".action.coded").first).to_be_visible()

    def test_editor_can_download_when_browser_storage_is_blocked(self):
        page = self.page
        page.add_init_script("Object.defineProperty(window, 'localStorage', {get(){throw Error('blocked')}})")
        page.goto(self.base + "editor.html")
        page.get_by_role("button", name=re.compile("Кот под голосовым")).click()
        expect(page.get_by_text("Черновик в памяти", exact=False)).to_be_visible()
        with page.expect_download() as download:
            page.get_by_role("button", name="Скачать черновик", exact=True).click()
        self.assertTrue(download.value.suggested_filename.endswith(".stop-kadr.json"))

    def test_editor_draft_survives_reload_and_only_appears_in_preview(self):
        page = self.page
        page.goto(self.base + "editor.html")
        page.get_by_role("button", name=re.compile("Кот под голосовым")).click()
        page.get_by_role("button", name="Читать дальше →").click()
        page.locator(".group.private").get_by_role("button", name="Изменить реплику").first.click()
        box = page.get_by_role("dialog").get_by_label("Реплика", exact=True)
        text = box.input_value() + " Пробная редакторская правка."
        box.fill(text)
        page.get_by_role("button", name="Сохранить", exact=True).click()
        page.reload()
        expect(page.locator(".group.private")).to_contain_text(text)
        cards = page.locator(".choice[data-code]")
        expect(cards.first).to_be_visible()
        editor_levels = [(card.get_attribute("data-code"), card.locator(".choice-level").inner_text())
                         for card in cards.all()]
        page.get_by_role("button", name="Проверить в игре").click()
        frame = page.frame_locator("#preview iframe")
        expect(frame.locator("#messages")).to_contain_text(text)
        options = frame.locator(".coded")
        expect(options).to_have_count(len(editor_levels))
        for option, (code, caption) in zip(options.all(), editor_levels):
            self.assertEqual(option.get_attribute("data-code"), code)
            expect(option.locator(".code-tag")).to_contain_text(caption)
        page.get_by_role("button", name="Вернуться к тексту", exact=True).click()
        page.goto(self.base + "focus.html?case=sticker&role=self#pressure")
        expect(page.locator(".coded").first).to_be_visible()
        expect(page.locator("#messages")).not_to_contain_text(text)

    def test_self_catalog_retry(self):
        self.retry("**/game/catalog.js*", url=self.base + "self.html?view=cases")
        card = self.page.locator('.case-card[href*="case=voice&role=self"]')
        card.click()
        expect(self.page.locator(".action.coded").first).to_be_visible()
        self.assertIn("role=self", self.page.url)

    def test_saved_ending_retry(self):
        url = self.base + "focus.html?case=money&role=witness#focus-ease"
        self.retry("**/game/stories/money.js*", url=url)
        expect(self.page.locator("#outcome-title")).to_be_visible()
        self.assertEqual(self.page.url, url)

    def test_review_retry_restores_step_answer_and_history(self):
        page = self.page
        page.goto(self.base + "focus.html?case=money&role=witness#pressure")
        page.get_by_role("button", name=re.compile("Закрою чат")).click()
        page.get_by_role("button", name=re.compile("Уберу телефон и пойду домой")).click()
        expect(page.locator("#outcome-title")).to_be_visible()
        outcome = page.locator("#outcome-title").inner_text()
        ending_url = page.url
        page.locator("button.inspect").click()
        page.get_by_role("button", name="Дальше", exact=True).click()
        review = page.locator(".decision-review")
        expect(review.locator(".chosen-answer")).to_contain_text("Уберу телефон и пойду домой")
        second_step = review.inner_text()
        self.retry("**/game/stories/money.js*")
        expect(review).to_have_text(second_step, use_inner_text=True)
        self.assertEqual(page.url, ending_url)
        page.go_back()
        expect(page.locator("#outcome-title")).to_have_text(outcome)
        page.go_forward()
        expect(review).to_have_text(second_step, use_inner_text=True)
        page.get_by_role("button", name=re.compile("другой ответ|Вернуться к выбору")).click()
        page.get_by_role("button", name=re.compile("Всё-таки отвечу")).click()
        self.assertTrue(page.url.endswith("#back-in"), page.url)

    def test_voice_requests_only_the_recording_played_and_stops_on_rewind(self):
        page = self.page
        recordings = []
        page.on("request", lambda request: recordings.append(request.url)
                if urlsplit(request.url).path.endswith(".mp3") else None)
        page.goto(self.base + "focus.html?case=voice&role=self#pressure")
        choose = page.get_by_role("button", name=re.compile("Перейду в текст"))
        expect(choose).to_be_visible()
        page.wait_for_load_state("networkidle")
        self.assertEqual(recordings, [])
        choose.click()
        review = page.locator("button.inspect")
        expect(review).to_be_visible()
        buttons = page.locator(".play-audio")
        self.assertGreater(buttons.count(), 1)
        play = buttons.first
        row = page.locator(".live-voice").first
        expect(row.locator(".chat-media p").first).to_be_visible()
        chosen_url = urljoin(page.url, play.get_attribute("data-src"))
        self.assertEqual(recordings, [])
        play.focus()
        page.keyboard.press("Enter")
        player = page.locator("audio").element_handle()
        page.wait_for_function("el => !el.paused && el.currentTime > 0", arg=player)
        self.assertEqual(set(recordings), {chosen_url})
        review.click()
        expect(page.locator(".decision-review")).to_be_visible()
        self.assertTrue(player.evaluate("el => el.paused && !el.ended"))
        self.assertEqual(set(recordings), {chosen_url})

    def test_voice_download_can_retry(self):
        page = self.page
        page.goto(self.base + "focus.html?case=voice&role=self#pressure")
        row = page.locator(".live-voice").first
        play = row.get_by_role("button", name=re.compile("Прослушать"))
        expect(play).to_be_visible()
        src = urljoin(page.url, play.get_attribute("data-src"))
        page.route(src, lambda route: route.abort())
        play.click()
        retry = row.get_by_role("button", name=re.compile("Повторить"))
        expect(retry).to_be_focused()
        page.unroute(src)
        retry.press("Enter")
        page.wait_for_function("() => document.querySelector('audio')?.currentTime > 0")

    def test_transcript_and_playback_from_file(self):
        page = self.page
        page.goto((DOCS / "focus.html").as_uri() + "?case=sticker&role=witness#pressure")
        row = page.locator(".voice").first
        row.locator("summary").click()
        expect(row.locator(".transcript p")).to_be_visible()
        self.assertEqual(page.locator("audio[src]").count(), 0)
        row.locator(".play-audio").click()
        page.wait_for_function("() => document.querySelector('audio')?.currentTime > 0")


    def test_large_text_reflows_at_320_pixels(self):
        page = self.page
        page.set_viewport_size({"width": 320, "height": 568})
        cdp = page.context.new_cdp_session(page)
        cdp.send("Page.setFontSizes", {"fontSizes": {"standard": 32, "fixed": 32}})
        for path, selector in [
            ("index.html", ".start-game"),
            ("index.html?view=cases", ".case-card"),
            ("colors.html", "#black"),
            ("focus.html?case=sticker&role=witness#pressure", ".action.coded"),
        ]:
            with self.subTest(path=path):
                page.goto(self.base + path)
                target = page.locator(selector).first
                expect(target).to_be_visible()
                self.assertGreaterEqual(page.locator("html").evaluate("e => parseFloat(getComputedStyle(e).fontSize)"), 32)
                self.assertEqual(page.locator("html").evaluate("e => e.scrollWidth"), 320)
                target.scroll_into_view_if_needed()
                rect = target.bounding_box()
                self.assertGreaterEqual(rect["x"], 0)
                self.assertLessEqual(rect["x"] + rect["width"], 320)
        self.assertEqual(page.locator(".mode-bar").evaluate("e => getComputedStyle(e).position"), "static")
        page.locator(".action.coded").first.focus()
        page.keyboard.press("Enter")
        expect(page).not_to_have_url(re.compile("#pressure$"))

    def test_player_name_contrast_in_all_five_attention_colours(self):
        page = self.page
        page.goto(self.base + "focus.html?case=money&role=witness#call")
        player = page.locator(".msg.you > strong").first
        expect(player).to_be_visible()

        def luminance(rgb):
            srgb = [int(value) / 255 for value in re.findall(r"\d+", rgb)[:3]]
            linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb]
            return sum(value * weight for value, weight in zip(linear, (0.2126, 0.7152, 0.0722)))

        for colour in ["white", "yellow", "orange", "red", "black"]:
            with self.subTest(colour=colour):
                page.locator("html").evaluate("(e, colour) => e.dataset.code = colour", colour)
                rgb = player.evaluate("e => [getComputedStyle(e).color, getComputedStyle(e.parentElement).backgroundColor]")
                dark, light = sorted(map(luminance, rgb))
                self.assertGreaterEqual((light + 0.05) / (dark + 0.05), 4.5)

    def test_rehearsal_has_a_description_and_timed_music_captions(self):
        page = self.page
        for url in [self.base + "focus.html", (DOCS / "focus.html").as_uri()]:
            with self.subTest(url=url):
                page.goto(url + "?case=dubl&role=witness#calm-end")
                clip = page.locator(".chat-media figure")
                expect(clip.locator("figcaption")).to_contain_text("электрогитаре и клавишах")
                video = clip.locator("video")
                track = video.locator('track[kind="captions"][srclang="ru"]')
                self.assertEqual(track.count(), 1)
                page.wait_for_function("document.querySelector('video')?.textTracks[0]?.cues?.length > 0")
                cue = video.evaluate("v => { const c = v.textTracks[0].cues[0]; return [c.text, c.startTime, c.endTime]; }")
                self.assertIn("музыка", cue[0])
                self.assertEqual(cue[1], 0)
                self.assertAlmostEqual(cue[2], 7.28, places=2)

    def test_slide_links_preserve_authors_and_chart_values(self):
        page = self.page
        page.goto(self.base + "focus.html?case=project&role=self#calm")
        slides = page.get_by_role("link", name="Прочитать слайды текстом")
        expect(slides).to_have_count(2)
        for link, authors in zip(slides.all(), ("Миша, Аня.", "Миша, Аня, Тимур.")):
            with self.subTest(authors=authors):
                with page.expect_popup() as popup:
                    link.click()
                sheet = popup.value
                expect(sheet.get_by_role("heading", name="Наш школьный двор")).to_be_visible()
                expect(sheet.get_by_text("Авторы: " + authors, exact=True)).to_be_visible()
                for title, rows in [
                    ("Где проводят перемену", [("Во дворе", "12"), ("В коридоре", "8"), ("В классе", "4")]),
                    ("Чего во дворе не хватает", [("Скамеек", "11"), ("Навеса", "8"), ("Места для игр", "5")]),
                ]:
                    table = sheet.get_by_role("table", name=title)
                    for category, count in rows:
                        row = table.get_by_role("rowheader", name=category).locator("..")
                        expect(row.get_by_role("cell")).to_have_text(count)
                sheet.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
