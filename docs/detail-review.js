'use strict';

function createDetailReview(scene, cues, makeRow, motionAllowed) {
  const dialog = document.createElement('dialog');
  dialog.className = 'detail-dialog';
  dialog.setAttribute('aria-labelledby', 'detail-title');
  dialog.innerHTML = `
    <header class="detail-header">
      <div><p class="detail-scene"></p><h2 id="detail-title">Разбор деталей</h2></div>
      <button class="detail-close" type="button" aria-label="Закрыть разбор">Закрыть</button>
    </header>
    <div class="detail-feed" role="region" tabindex="0" aria-label="Повтор переписки">
      <div class="thread"></div>
    </div>
    <footer class="detail-footer">
      <div class="detail-description" aria-live="polite" aria-atomic="true">
        <p class="detail-count"></p><p class="detail-caption"></p>
      </div>
      <button class="action forward detail-next" type="button">Дальше</button>
    </footer>
    <div class="detail-flash" aria-hidden="true"></div>`;
  scene.append(dialog);
  const feed = dialog.querySelector('.detail-feed');
  const transcript = feed.querySelector('.thread');
  const count = dialog.querySelector('.detail-count');
  const caption = dialog.querySelector('.detail-caption');
  const next = dialog.querySelector('.detail-next');
  const flash = dialog.querySelector('.detail-flash');
  const mediaTargets = {
    '@reactions': '.reactions', '@transcript': '.transcript', '@document': '.file-card',
    '@image': '.open-image', '@sticker': '.sticker img'
  };
  let items = [];
  let position = 0;
  let stop = 0;
  let total = 0;
  let timer = null;
  let lastPulse = -Infinity;
  let complete = false;

  function cueFor(key) {
    // The two observations share the later messages; in the original case three interpretations lead to the same reply.
    const canonical = key.replace(/^notice-[01]-/, 'later-').replace(/^(joke|permission|unclear)-/, 'reply-');
    return cues[canonical];
  }

  function highlight(row, focus) {
    const selector = mediaTargets[focus];
    if (selector) {
      const target = row.querySelector(selector);
      if (target instanceof HTMLDetailsElement) target.open = true;
      if (target) return target;
    } else {
      const text = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      for (let node = text.nextNode(); node; node = text.nextNode()) {
        const index = node.data.toLocaleLowerCase('ru').indexOf(focus.toLocaleLowerCase('ru'));
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + focus.length);
        const mark = document.createElement('mark');
        range.surroundContents(mark);
        return mark;
      }
    }
    return row;
  }

  function finish() {
    complete = true;
    count.textContent = 'Конец повтора';
    caption.textContent = personalRole
      ? 'Что в твоих словах или поступках могли заметить другие? Какой поддержки тебе хотелось в этот момент?'
      : 'Какая деталь помогла тебе понять, каково человеку? Как можно узнать у него, какая помощь ему подойдёт?';
    next.textContent = 'Вернуться к сцене';
    next.removeAttribute('aria-disabled');
  }

  function showNextRow() {
    timer = null;
    if (!dialog.open) return;
    while (position < items.length) {
      const item = items[position++];
      const row = makeRow(item);
      transcript.append(row);
      const cue = cueFor(item.key);
      if (cue) {
        const target = highlight(row, cue[0]);
        target.classList.add('detail-focus');
        row.classList.add('detail-current');
        count.textContent = 'Деталь ' + (++stop) + ' из ' + total;
        caption.textContent = cue[1];
        next.textContent = stop === total ? 'К итогу' : 'Дальше';
        next.removeAttribute('aria-disabled');
        target.scrollIntoView({block:'nearest', behavior:'instant'});
        if (motionAllowed()) {
          flash.animate([{opacity:.36}, {opacity:0}], {duration:230, easing:'ease-out'});
          lastPulse = performance.now();
        }
        return;
      }
      feed.scrollTop = feed.scrollHeight;
      if (motionAllowed() && position < items.length) {
        timer = setTimeout(showNextRow, 155);
        return;
      }
    }
    finish();
  }

  function advance() {
    if (next.hasAttribute('aria-disabled')) return;
    if (complete) return dialog.close();
    dialog.querySelector('.detail-current')?.classList.remove('detail-current');
    dialog.querySelectorAll('audio,video').forEach(player => player.pause());
    next.setAttribute('aria-disabled','true');
    count.textContent = 'Быстрый повтор';
    caption.textContent = '';
    if (motionAllowed() && position < items.length) {
      const delay = Math.max(155, 750 - (performance.now() - lastPulse));
      timer = setTimeout(showNextRow, delay);
    } else showNextRow();
  }

  next.addEventListener('click', advance);
  dialog.querySelector('.detail-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    clearTimeout(timer);
    timer = null;
    dialog.querySelectorAll('audio,video').forEach(player => player.pause());
    transcript.replaceChildren();
    items = [];
  });

  return {
    cueFor,
    close() { if (dialog.open) dialog.close(); },
    open(played, title) {
      if (dialog.open) return;
      clearTimeout(timer);
      items = played;
      position = 0;
      stop = 0;
      total = items.filter(item => cueFor(item.key)).length;
      complete = false;
      transcript.replaceChildren();
      dialog.querySelector('.detail-scene').textContent = title;
      next.removeAttribute('aria-disabled');
      next.textContent = 'Дальше';
      dialog.showModal();
      advance();
    }
  };
}
