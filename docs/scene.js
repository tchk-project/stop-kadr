'use strict';

const panel = document.querySelector('.panel');
if (isCatalogue) {
  showCatalogue(panel);
} else {
  linkCurrentEpisode();
  playScene();
}

function playScene() {
  const pages = new Map();
  for (const section of panel.querySelectorAll('.page')) {
    pages.set(section.id, {
      title: section.querySelector('h1').textContent,
      parent: section.dataset.parent,
      outcome: section.dataset.outcome && {kind:section.dataset.outcome, headline:section.dataset.headline},
      review: section.hasAttribute('data-review'),
      lines: [...section.querySelectorAll('.msg')].map(el => el.cloneNode(true)),
      note: section.querySelector('.note')?.textContent || '',
      question: section.querySelector('h2')?.textContent || '',
      links: [...section.querySelectorAll('a')].map(el => ({
        id: el.hash.slice(1), label: el.textContent
      }))
    });
  }
  if (isAttentionPilot) loadAttentionScene(pages);
  else if (episode) loadEpisode(pages, episode);
  const forks = isAttentionPilot ? [] : episode ? ['notice-0', 'notice-1'] : ['joke', 'permission', 'unclear'];
  const parents = {readrespect:'respect', cautious:'respect', group:'pressure', direct:'pressure', wait:'pressure'};
  const shapes = {
    forward: '<path d="M4 4h16v12H9l-5 4z"/>',
    rewind: '<path d="m12 5-8 7 8 7zM21 5l-8 7 8 7z"/>',
    finish: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
    play: '<path d="m7 4 13 8-13 8z"/>',
    dismiss: '<path d="m6 6 12 12M6 18 18 6"/>',
    inspect: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>'
  };

  function button(kind, label, onClick, icon = kind) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'action ' + kind;
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' + shapes[icon] + '</svg>';
    el.append(label);
    el.addEventListener('click', onClick);
    return el;
  }

  const scene = document.createElement('section');
  scene.className = 'scene';
  scene.innerHTML = `
    <p class="small scene-role"></p>
    <h1 tabindex="-1"></h1>
    <div class="thread" id="messages" role="region" aria-label="История переписки"></div>
    <div class="typing" hidden><span class="typing-name"></span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
    <div class="screen-flash" aria-hidden="true"></div>
    <p class="freeze" hidden>Стоп-кадр</p>
    <section class="outcome" aria-labelledby="outcome-label outcome-title" tabindex="-1" hidden>
      <p class="outcome-label"><span class="outcome-icon" aria-hidden="true"></span><span id="outcome-label"></span></p>
      <h2 id="outcome-title"></h2><p class="outcome-reason"></p>
    </section>
    <p class="note"></p><h2 class="question" tabindex="-1"></h2>
    <p class="choice-hint" hidden>Переписка на паузе. Нажми на один из вариантов ниже, чтобы продолжить.</p>
    <nav class="choices" aria-label="Продолжить беседу"></nav>
    <nav class="tools" aria-label="Управление сценой"><div class="playback-controls"></div></nav>
    <div class="sr" role="status"></div>`;
  panel.querySelectorAll('.page').forEach(el => el.remove());
  panel.append(scene);
  const roleLine = scene.querySelector('.scene-role');
  const place = isAttentionPilot ? 'Спортивная секция' : activeStory.place;
  roleLine.append(portrait(playerName), element('span', '', 'Ты — '+playerName+' · '+place));
  document.title = activeStory.title + ' · Стоп-кадр';
  const heading = scene.querySelector('h1');
  const thread = scene.querySelector('.thread');
  const typing = scene.querySelector('.typing');
  const flash = scene.querySelector('.screen-flash');
  const freeze = scene.querySelector('.freeze');
  const note = scene.querySelector('.note');
  const question = scene.querySelector('.question');
  const outcome = scene.querySelector('.outcome');
  const outcomeLabels = {
    positive: {label:'Удачный исход', icon:'✓'},
    negative: {label:'Неудачный исход', icon:'×'},
    mixed: {label:'Смешанный исход', icon:'≈'},
    open: {label:'Исход пока открыт', icon:'…'}
  };
  const hint = scene.querySelector('.choice-hint');
  const choices = scene.querySelector('.choices');
  const controls = scene.querySelector('.playback-controls');
  if (!isAttentionPilot) controls.after(button('finish', 'Завершить', finishScene));
  const status = scene.querySelector('[role=status]');
  function pauseMedia(except) {
    scene.querySelectorAll('audio, video').forEach(player => {
      if (player !== except && !player.paused) player.pause();
    });
  }
  scene.addEventListener('play', event => pauseMedia(event.target), true);
  window.addEventListener('pagehide', () => pauseMedia());
  const photo = document.createElement('dialog');
  photo.className = 'photo-dialog';
  photo.setAttribute('aria-label', 'Скриншот переписки');
  const fullImage = document.createElement('img');
  photo.append(fullImage, button('dismiss', 'Закрыть скриншот', () => photo.close()));
  scene.append(photo);
  scene.addEventListener('click', event => {
    const preview = event.target.closest('.open-image')?.querySelector('img');
    if (!preview) return;
    fullImage.src = preview.src;
    fullImage.alt = preview.alt;
    photo.showModal();
  });

  function locationState() {
    const hash = location.hash.slice(1);
    const id = pages.has(hash) ? hash : 'start';
    const saved = history.state?.sceneFork;
    return {id, fork:forks.includes(id) ? id : forks.includes(saved) ? saved : forks.at(-1)};
  }

  function pathFor({id, fork}) {
    if (id === 'start') return [id];
    const parent = pages.get(id)?.parent;
    if (parent) return [...pathFor({id:parent, fork}), id];
    if (forks.includes(id)) return ['start', id];
    return ['start', fork, ...parents[id] ? [parents[id], id] : [id]];
  }

  function messages(location) {
    const result = [];
    const path = pathFor(location);
    path.forEach((id, i) => {
      const data = pages.get(id);
      if (i && (isAttentionPilot ? !data.continuation : forks.includes(id) || data.continuation || !data.lines.length)) {
        const decision = pages.get(path[i-1]).links.find(link => link.id === id);
        const marker = document.createElement('div');
        marker.className = 'choice-mark';
        marker.append(element('p', '', data.continuation ? 'Возможное продолжение · '+data.continuation : 'Твой выбор · '+decision.label));
        if (forks.includes(id) && data.note) marker.append(element('p', 'choice-comment', data.note));
        if (isAttentionPilot && !data.continuation) {
          const before = pages.get(path[i-1]).mode;
          const label = before === data.mode ? attentionModes[data.mode].name : attentionModes[before].name+' → '+attentionModes[data.mode].name;
          marker.prepend(element('p','mode-change',label));
        }
        result.push({step:id, key:id+'-choice', content:marker, attention:data.mode});
      }
      data.lines.forEach((line, index) => {
        const content = line.cloneNode(true);
        addAvatar(content);
        result.push({step:id, key:id+'-'+index, content, attention:data.mode});
      });
    });
    return result;
  }

  let state = locationState();
  let sequence = 0;
  let busy = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reduced.matches && typeof Element.prototype.animate === 'function';
  const cues = isAttentionPilot ? attentionCues : sceneDetails[episode?.id || 'dubl']?.[role] || {};
  const review = !isAttentionPilot && createDetailReview(scene, cues, makeRow, motionAllowed);

  function makeRow(item) {
    const row = element('div', 'item');
    row.dataset.key = item.key;
    row.dataset.step = item.step;
    if (item.content.dataset.context) row.append(element('p', 'chat-context', item.content.dataset.context));
    row.append(item.content);
    return row;
  }

  function setControls() {
    choices.replaceChildren();
    controls.replaceChildren();
    const {id} = state;
    const data = pages.get(id);
    freeze.hidden = !data.question;
    if (data.outcome) {
      const {kind, headline} = data.outcome;
      outcome.dataset.kind = kind;
      outcome.querySelector('.outcome-icon').textContent = outcomeLabels[kind].icon;
      outcome.querySelector('#outcome-label').textContent = outcomeLabels[kind].label;
      outcome.querySelector('#outcome-title').textContent = headline;
      outcome.querySelector('.outcome-reason').textContent = data.note;
      outcome.hidden = false;
    } else {
      note.textContent = forks.includes(id) ? '' : data.note;
    }
    question.textContent = data.question || '';
    hint.hidden = id !== 'start' || !data.question;
    if (!data.question && [...thread.children].some(row => review.cueFor(row.dataset.key))) {
      choices.append(button('inspect', 'Разобрать детали', () => {
        pauseMedia();
        review.open(messages(state), heading.textContent);
      }));
    }
    for (const {id:target,label} of data.links) {
      if (target === 'start') continue;
      const isRewind = data.review || Boolean(parents[id]);
      const container = isRewind ? controls : choices;
      const option = button(isRewind ? 'rewind' : 'forward', label, () => go(target));
      container.append(option);
    }
    const previous = pathFor(state).at(-2);
    if (previous && !data.links.some(link => link.id === previous)) {
      controls.append(button('rewind','На шаг назад', () => go(previous)));
    }
    if (data.review || parents[id]) controls.append(button('rewind','Перемотать в начало', () => go('start')));
  }
  function go(id) {
    if (busy) return;
    const next = {id, fork:forks.includes(id) ? id : state.fork};
    history.pushState({sceneFork:next.fork}, '', '#'+id);
    render(next, true);
  }
  function finishScene() {
    pauseMedia();
    location.assign(currentFile);
  }
  let followNew = false;
  function stopFollowing() { followNew = false; }
  window.addEventListener('wheel', stopFollowing, {passive:true});
  window.addEventListener('touchmove', stopFollowing, {passive:true});
  thread.addEventListener('pointerdown', stopFollowing);
  thread.addEventListener('focusin', stopFollowing);
  window.addEventListener('keydown', event => {
    if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) stopFollowing();
  });

  let wake = null;
  let skip = false;
  function finishWaiting() {
    skip = true;
    wake?.();
  }
  function delay(ms) {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); wake = null; resolve(); };
      const timer = setTimeout(done, ms);
      wake = done;
    });
  }
  function clearPrompt() {
    flash.getAnimations().forEach(animation => animation.cancel());
    freeze.getAnimations().forEach(animation => animation.cancel());
    freeze.hidden = true;
    outcome.hidden = true;
    typing.hidden = true;
    note.textContent = '';
    question.textContent = '';
    hint.hidden = true;
    choices.replaceChildren();
    controls.replaceChildren();
  }
  function flashFreeze() {
    const chat = thread.getBoundingClientRect();
    const label = freeze.getBoundingClientRect();
    const scale = Math.min(2.4, chat.width * 0.85 / label.width);
    const x = chat.left + (chat.width - label.width * scale) / 2 - label.left;
    const y = chat.bottom - Math.min(chat.height / 2, 100) - label.height * scale / 2 - label.top;
    const stampColor = isAttentionPilot ? getComputedStyle(scene).getPropertyValue('--tint').trim() : '#eef7f0';
    const stamp = {
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
      backgroundColor: stampColor, boxShadow: '0 0 0 4px '+stampColor
    };
    if (!isAttentionPilot) flash.animate([
      {opacity: 1}, {opacity: 1, offset: 0.12, easing: 'ease-out'}, {opacity: 0}
    ], {duration: 270});
    freeze.animate([
      stamp, {...stamp, offset: 0.16},
      {transform: 'none', backgroundColor: 'transparent', boxShadow: '0 0 0 0 transparent'}
    ], {duration: 680, easing: 'cubic-bezier(.3, 0, .2, 1)'});
  }
  async function render(next, interactive) {
    review.close();
    const ticket = ++sequence;
    finishWaiting();
    pauseMedia();
    skip = !interactive || reduced.matches;
    followNew = interactive;
    busy = true;
    clearPrompt();
    if (photo.open) photo.close();
    thread.getAnimations({subtree:true}).forEach(animation => animation.cancel());
    const items = messages(next);
    const current = [...thread.children];
    let common = 0;
    while (common < current.length && common < items.length && current[common].dataset.key === items[common].key) common++;
    const removed = current.slice(common).reverse();
    const motion = interactive && motionAllowed();
    scene.setAttribute('aria-busy','true');
    if (removed.length && motion) {
      // Remove the newest bubble first. As each collapses, the older history comes into view.
      for (const row of removed) {
        const height = row.offsetHeight;
        const effect = row.animate([
          {height:height+'px', opacity:1, transform:'translateY(0)'},
          {height:height+'px', opacity:0.25, transform:'translateY(-8px)', offset:0.5},
          {height:'0px', opacity:0, transform:'translateY(-12px)'}
        ], {duration:Math.min(170, 550/removed.length), easing:'ease-in', fill:'forwards'});
        await effect.finished.catch(() => {});
        if (ticket !== sequence) return;
        row.remove();
      }
    } else removed.forEach(row => row.remove());
    state = next;
    const active = pages.get(next.id);
    heading.textContent = pages.get('start').title;
    controls.append(button('dismiss', 'Показать сразу', finishWaiting, 'play'));
    for (const [i, item] of items.slice(common).entries()) {
      const onStep = item.step === next.id;
      const name = item.content.querySelector('strong')?.textContent.split(' · ')[0];
      if (!skip && onStep && name) {
        const incoming = name !== 'Ты' && name !== 'Ремарка' && name !== 'Система';
        typing.hidden = !incoming;
        if (incoming) {
          const action = item.content.classList.contains('live-voice') ? ' говорит'
            : item.content.classList.contains('voice') ? ' записывает голосовое'
            : item.content.classList.contains('sticker') ? ' выбирает стикер'
            : item.content.querySelector('img, video') ? ' отправляет вложение' : ' пишет';
          typing.querySelector('.typing-name').textContent = name + action;
        }
        const longPause = incoming && (i + pathFor(next).length) % 3 === 0;
        await delay(longPause ? 2150 : 420 + Math.min(420, item.content.textContent.length * 4));
        if (ticket !== sequence) return;
      }
      typing.hidden = true;
      const row = makeRow(item);
      thread.append(row);
      if (onStep && followNew && (!skip || i === 0) && row.getBoundingClientRect().bottom > window.innerHeight) {
        row.scrollIntoView({block:'nearest', behavior:'instant'});
      }
      if (motion && onStep && !skip) row.animate([{opacity:0, transform:'translateY(6px)'},{opacity:1, transform:'none'}],
        {duration:160, easing:'ease-out'});
    }
    if (!skip) {
      await delay(400);
      if (ticket !== sequence) return;
    }
    setControls();
    if (interactive) {
      const target = active.outcome ? outcome : question;
      target.tabIndex = -1;
      if (followNew) {
        target.focus({preventScroll:true});
        if (items.length === common || target.getBoundingClientRect().bottom > window.innerHeight) {
          target.scrollIntoView({block:'nearest', behavior:'instant'});
        }
      }
      status.textContent = active.outcome ? outcomeLabels[active.outcome.kind].label + '. ' + active.outcome.headline : 'Стоп-кадр. ' + active.question;
    }
    if (interactive && active.question && motionAllowed()) flashFreeze();
    scene.removeAttribute('aria-busy');
    busy = false;
  }
  function fromAddress(interactive) {
    if (location.hash === '#end') {
      location.replace(currentFile);
      return;
    }
    const next = locationState();
    render(next, interactive || next.id === 'start');
  }
  if (isAttentionPilot) {
    playAttentionPilot({pages, pathFor, messages, makeRow, button, scene, heading, thread, typing,
      flash, freeze, question, outcome, outcomeLabels, choices, controls, status, finishScene,
      clearPrompt, flashFreeze, motionAllowed, reduced, setFollow: value => { followNew = value; },
      shouldFollow: () => followNew});
    return;
  }
  window.addEventListener('popstate', () => fromAddress(true));
  fromAddress(false);
}
