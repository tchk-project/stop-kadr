"""Keyboard, narrow-screen and reading-sheet regressions through published game URLs."""
import os
import re
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


class PlayerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass

        docs = Path(__file__).resolve().parents[1] / 'docs'
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=docs))
        cls.addClassCleanup(server.server_close)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.addClassCleanup(server.shutdown)
        cls.base = f'http://127.0.0.1:{server.server_port}/'
        playwright = sync_playwright().start()
        cls.addClassCleanup(playwright.stop)
        cls.browser = playwright.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE_PATH'))
        cls.addClassCleanup(cls.browser.close)

    def page(self, route, width=390, height=844, motion='reduce'):
        page = self.browser.new_page(viewport={'width': width, 'height': height},
                                     reduced_motion=motion, has_touch=True)
        self.addCleanup(page.close)
        page.goto(self.base + route)
        return page

    def test_keyboard_during_playback_can_skip_read_and_rewind(self):
        page = self.page('focus.html?case=money&role=witness#pressure', motion='no-preference')
        skip = page.locator('.tape-skip')
        expect(skip).to_be_in_viewport()
        skip.press('Enter')
        expect(skip).to_have_text('К ответам')
        skip.press('Enter')
        expect(page.locator('.question')).to_be_focused()
        page.keyboard.press('Tab')
        expect(page.locator('.choices .coded').first).to_be_focused()
        page.keyboard.press('Space')
        expect(page.locator('.tape-controls')).to_be_focused()
        page.keyboard.press('Tab')
        expect(skip).to_be_focused()
        page.keyboard.press('Enter')
        expect(skip).to_have_text('Прочитать новые сообщения')
        skip.press('Enter')
        expect(page.locator('[data-key="check-0"]')).to_be_focused()
        page.get_by_role('button', name='На шаг назад').press('Enter')
        expect(page.locator('.tape-controls')).to_be_focused()
        page.keyboard.press('Tab')
        expect(skip).to_be_focused()
        # Deliberately move past the playback controls before the rewind finishes.
        page.keyboard.press('Tab')
        expect(page.locator('.story-exit')).to_be_focused()
        page.wait_for_selector('.scene:not([aria-busy])', timeout=30000)
        expect(page.locator('.story-exit')).to_be_focused()

    def test_review_heading_is_visible_at_every_stop_on_narrow_screens(self):
        for height in (568, 180):
            with self.subTest(height=height):
                page = self.page('focus.html?case=money&role=witness#silence', 320, height)
                page.locator('button.inspect').press('Enter')
                heading = page.locator('.decision-review h2')
                for index, move in [(1, 'Дальше'), (2, 'Назад'), (1, None)]:
                    expect(heading).to_have_text(f'Остановка {index} из 2')
                    expect(heading).to_be_focused()
                    visible = heading.evaluate('''h => {
                      const b = document.querySelector('.mode-bar');
                      const top = getComputedStyle(b).position === 'sticky' ? b.getBoundingClientRect().bottom : 0;
                      const r = h.getBoundingClientRect(), first = h.nextElementSibling.firstElementChild.getBoundingClientRect();
                      return r.top >= Math.max(0,top) && r.bottom <= innerHeight && first.top < innerHeight
                        && h.contains(document.elementFromPoint(r.left+r.width/2, r.top+r.height/2));
                    }''')
                    self.assertTrue(visible)
                    if move:
                        page.get_by_role('button', name=move, exact=True).press('Enter')

    def test_review_only_rewinds_between_adjacent_decisions(self):
        page = self.page('focus.html?case=money&role=witness#silence', motion='no-preference')
        skip = page.locator('.tape-skip')
        page.locator('button.inspect').press('Enter')
        expect(page.locator('.tape-direction')).to_contain_text('Назад · 3×')
        skip.press('Enter')
        first_choice = page.locator('[data-key="ignore-choice"]').element_handle()
        page.get_by_role('button', name='Дальше', exact=True).press('Enter')
        expect(page.locator('.tape-direction')).to_contain_text('Вперёд · 3×')
        skip.press('Enter')
        page.get_by_role('button', name='Назад', exact=True).press('Enter')
        expect(page.locator('.tape-direction')).to_contain_text('Назад · 3×')
        skip.press('Enter')
        expect(page.locator('.decision-review h2')).to_have_text('Остановка 1 из 2')
        self.assertTrue(first_choice.evaluate('e => e.isConnected'))
        page.get_by_role('button', name='Дальше', exact=True).press('Enter')
        skip.press('Enter')
        page.get_by_role('button', name='Попробовать другой ответ').press('Enter')
        expect(page).to_have_url(re.compile('#ignore$'))
        skip.press('Enter')
        expect(page.locator('.choices .coded')).to_have_count(2)

    def test_reload_keeps_the_second_review_heading_and_keyboard_position(self):
        for width, height, motion in [(320, 568, 'reduce'), (360, 640, 'no-preference')]:
            with self.subTest(width=width):
                page = self.page('focus.html?case=money&role=witness#silence', width, height, motion)
                page.locator('button.inspect').press('Enter')
                if motion != 'reduce':
                    page.locator('.tape-skip').press('Enter')
                page.get_by_role('button', name='Дальше', exact=True).press('Enter')
                if motion != 'reduce':
                    page.locator('.tape-skip').press('Enter')
                heading = page.get_by_role('heading', name='Остановка 2 из 2')
                expect(heading).to_be_visible()
                page.reload()
                expect(heading).to_be_focused()
                self.assert_reading_position(heading)
                page.keyboard.press('Tab')
                expect(page.get_by_role('button', name='Назад', exact=True)).to_be_focused()

    def assert_reading_position(self, target):
        self.assertTrue(target.evaluate('''e => {
          const bar = document.querySelector('.mode-bar');
          const top = getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : 0;
          const r = e.getBoundingClientRect();
          return r.top >= Math.max(0,top) && r.top < innerHeight && r.bottom <= innerHeight;
        }'''))

    def test_forced_line_is_readable_with_its_decision_and_retry_is_precise(self):
        page = self.page('focus.html?case=abdomen&role=self#call-report')
        page.locator('button.inspect').press('Enter')
        expect(page.locator('.decision-review h2')).to_have_text('Остановка на твоём выборе')
        page.get_by_text('Что произошло дальше', exact=True).click()
        expect(page.locator('.review-continuation')).to_contain_text('справа внизу')
        page.get_by_role('button', name='Попробовать другой ответ').press('Enter')
        expect(page).to_have_url(re.compile('#pressure$'))
        expect(page.locator('.choices .coded')).to_have_count(2)

    def test_outcome_opens_reader_at_the_same_role_and_keyboard_position(self):
        for role in ('witness', 'self'):
            with self.subTest(role=role):
                page = self.page(f'focus.html?case=money&role={role}#calm-end', 320, 568)
                page.get_by_role('link', name='Читать этот момент текстом').press('Enter')
                article = page.locator(f'#{role}-calm-end')
                expect(article.locator('h3')).to_be_focused()
                page.keyboard.press('Tab')
                expect(article.locator('a').first).to_be_focused()
                page.get_by_role('link', name='Открыть этот момент в игре').and_(article.locator('a')).click()
                expect(page).to_have_url(re.compile(f'role={role}#calm-end$'))
                outcome = page.locator('.outcome')
                expect(outcome).to_be_focused()
                self.assert_reading_position(outcome)
                page.keyboard.press('Tab')
                expect(page.locator('.choices button').first).to_be_focused()

    def test_reader_and_game_reopen_the_same_choice_or_review_stop(self):
        for role in ('witness', 'self'):
            with self.subTest(role=role):
                page = self.page(f'focus.html?case=money&role={role}#pressure', 320, 568)
                reader = page.get_by_role('link', name='Читать этот момент текстом')
                reader.press('Enter')
                article = page.locator(f'#{role}-pressure')
                expect(article.locator('h3')).to_be_focused()
                page.go_back()
                expect(page.locator('.question')).to_be_focused()
                reader.press('Enter')
                article.get_by_role('link', name='Открыть этот момент в игре').press('Enter')
                expect(page.locator('.question')).to_be_focused()
                self.assert_reading_position(page.locator('.question'))
                page.keyboard.press('Tab')
                expect(page.locator('.choices .coded').first).to_be_focused()
        page = self.page('focus.html?case=money&role=witness#silence', 360, 640)
        page.locator('button.inspect').press('Enter')
        for index, step in enumerate(('ignore', 'silence'), 1):
            page.get_by_role('link', name='Читать этот момент текстом').press('Enter')
            article = page.locator(f'#witness-{step}')
            expect(article.locator('.review')).to_be_focused()
            expect(article.locator('.review')).to_be_in_viewport()
            article.get_by_role('link', name='Открыть этот момент в игре').press('Enter')
            expect(page).to_have_url(re.compile(r'role=witness#silence$'))
            heading = page.get_by_role('heading', name=f'Остановка {index} из 2')
            expect(heading).to_be_focused()
            self.assert_reading_position(heading)
            if index == 1:
                page.get_by_role('button', name='Дальше', exact=True).press('Enter')

    def test_reader_restore_respects_focus_taken_while_the_game_opens(self):
        page = self.page('read-story.html?case=money#witness-silence', 320, 568, 'no-preference')
        page.add_init_script('''new MutationObserver((_, observer) => {
          const exit = document.querySelector('.panel:not([hidden]) .story-exit');
          if (exit) { observer.disconnect(); exit.focus(); }
        }).observe(document, {subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});''')
        page.locator('#witness-silence').get_by_role('link', name='Открыть этот момент в игре').click()
        expect(page.locator('.scene:not([aria-busy]) .outcome')).to_be_visible()
        expect(page.locator('.story-exit')).to_be_focused()
        expect(page.locator('.mode-bar')).to_be_in_viewport()

    def test_back_dismisses_a_screenshot_on_the_changed_route(self):
        page = self.page('focus.html?case=rumour&role=witness#pressure', 360, 640)
        page.locator('.choices .coded').first.press('Enter')
        page.locator('.open-image').first.press('Enter')
        expect(page.get_by_role('dialog')).to_be_visible()
        page.go_back()
        expect(page).to_have_url(re.compile('#pressure$'))
        expect(page.locator('.photo-dialog')).to_be_hidden()
        expect(page.locator('.choices .coded').first).to_be_enabled()
        page.locator('.choices .coded').first.press('Enter')
        expect(page).not_to_have_url(re.compile('#pressure$'))

    def test_inspection_of_open_endings_allows_for_mixed_consequences(self):
        for story in ('voice', 'sticker'):
            with self.subTest(story=story):
                page = self.page(f'focus.html?case={story}&role=self#alternative')
                page.locator('.choices .coded').last.press('Enter')
                expect(page).to_have_url(re.compile('#pause$'))
                page.get_by_role('button', name='Разобрать мой выбор').press('Enter')
                expect(page.locator('.decision-review')).to_contain_text('За его')
        page = self.page('focus.html?case=money&role=witness#silence')
        expect(page.locator('button.inspect')).to_have_text('Что можно было сделать иначе?')

    def test_reader_preserves_sticker_replies_and_reactions_for_each_role(self):
        page = self.page('read-story.html?case=sticker#witness-start/danya-sticker', 320, 568)
        for role, stickers, reply in [('witness', ['danya-sticker', 'danya-sticker-2'], 'На голосовое Леры'),
                                      ('self', ['danya-sticker-3', 'danya-sticker-4'], 'На твоё голосовое')]:
            for step, sticker, names in zip(('start', 'pressure'), stickers, ('Миша, Костя', 'Аня')):
                line = page.locator(f'[id="{role}-{step}/{sticker}"]')
                expect(line.locator('.reply-to')).to_have_text(reply)
                expect(line).to_contain_text(names)


if __name__ == '__main__':
    unittest.main(verbosity=2)
