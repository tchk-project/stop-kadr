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
      review: section.hasAttribute('data-review'),
      lines: [...section.querySelectorAll('.msg')].map(el => el.cloneNode(true)),
      note: section.querySelector('.note')?.textContent || '',
      question: section.querySelector('h2')?.textContent || '',
      links: [...section.querySelectorAll('a')].map(el => ({
        id: el.hash.slice(1), label: el.textContent
      }))
    });
  }
  if (episode) loadEpisode(pages, episode);
  const forks = episode ? ['notice-0', 'notice-1'] : ['joke', 'permission', 'unclear'];
  const parents = {readrespect:'respect', cautious:'respect', group:'pressure', direct:'pressure', wait:'pressure'};
  const shapes = {
    forward: '<path d="M4 4h16v12H9l-5 4z"/>',
    rewind: '<path d="m12 5-8 7 8 7zM21 5l-8 7 8 7z"/>',
    finish: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
    play: '<path d="m7 4 13 8-13 8z"/>',
    dismiss: '<path d="m6 6 12 12M6 18 18 6"/>'
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
    <p class="small">Учебная сцена · школьная музыкальная группа</p>
    <h1 tabindex="-1"></h1>
    <div class="thread" id="messages" role="region" aria-label="История переписки"></div>
    <div class="typing" hidden><span class="typing-name"></span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
    <p class="freeze" hidden>Стоп-кадр</p>
    <p class="note"></p><h2 tabindex="-1"></h2>
    <nav class="choices" aria-label="Продолжить беседу"></nav>
    <nav class="tools" aria-label="Управление сценой"></nav>
    <div class="sr" role="status"></div>`;
  panel.querySelectorAll('.page').forEach(el => el.remove());
  panel.append(scene);
  if (episode) {
    scene.querySelector('.small').textContent = episode.place + ' · ' + (personalRole ? (episode.personalName ? 'ты — ' + episode.personalName : 'Давят на меня') : 'Я очевидец');
    document.title = episode.title + ' · Стоп-кадр';
  }
  const heading = scene.querySelector('h1');
  const thread = scene.querySelector('.thread');
  const typing = scene.querySelector('.typing');
  const freeze = scene.querySelector('.freeze');
  const question = scene.querySelector('h2');
  const choices = scene.querySelector('.choices');
  const controls = scene.querySelector('.tools');
  const status = scene.querySelector('[role=status]');
  function pauseMedia(except) {
    thread.querySelectorAll('audio, video').forEach(player => {
      if (player !== except && !player.paused) player.pause();
    });
  }
  thread.addEventListener('play', event => pauseMedia(event.target), true);
  window.addEventListener('pagehide', () => pauseMedia());
  const photo = document.createElement('dialog');
  photo.className = 'photo-dialog';
  photo.setAttribute('aria-label', 'Скриншот переписки');
  const fullImage = document.createElement('img');
  photo.append(fullImage, button('dismiss', 'Закрыть скриншот', () => photo.close()));
  scene.append(photo);
  thread.addEventListener('click', event => {
    const preview = event.target.closest('.open-image')?.querySelector('img');
    if (!preview) return;
    fullImage.src = preview.src;
    fullImage.alt = preview.alt;
    photo.showModal();
  });
  const dialog = document.createElement('dialog');
  dialog.className = 'end-dialog';
  dialog.setAttribute('aria-labelledby', 'end-title');
  dialog.innerHTML = '<h2 id="end-title">Завершить сцену?</h2><p>Можно остаться в переписке или закончить здесь.</p><div class="buttons"></div>';
  scene.append(dialog);
  dialog.querySelector('.buttons').append(
    button('dismiss','Отмена', () => dialog.close()),
    button('confirm-end','Завершить сцену', () => { dialog.close(); visit({id:'end', fork:state.fork}); }, 'finish')
  );

  function locationState() {
    const hash = location.hash.slice(1);
    const id = pages.has(hash) || hash === 'end' ? hash : 'start';
    const saved = history.state?.sceneFork;
    return {id, fork:forks.includes(id) ? id : forks.includes(saved) ? saved : forks.at(-1)};
  }

  function pathFor({id, fork}) {
    if (id === 'start' || id === 'end') return [id];
    const parent = pages.get(id)?.parent;
    if (parent) return [...pathFor({id:parent, fork}), id];
    if (forks.includes(id)) return ['start', id];
    return ['start', fork, ...parents[id] ? [parents[id], id] : [id]];
  }

  function messages(location) {
    if (location.id === 'end') return [];
    const result = [];
    const path = pathFor(location);
    path.forEach((id, i) => {
      const data = pages.get(id);
      if (i && (forks.includes(id) || !data.lines.length)) {
        const decision = pages.get(path[i-1]).links.find(link => link.id === id);
        const marker = document.createElement('div');
        marker.className = 'choice-mark';
        marker.append(element('p', '', 'Твой выбор · ' + decision.label));
        if (forks.includes(id) && data.note) marker.append(element('p', 'choice-comment', data.note));
        result.push({step:id, key:id+'-choice', content:marker});
      }
      data.lines.forEach((line, index) => {
        const content = line.cloneNode(true);
        addAvatar(content);
        result.push({step:id, key:id+'-'+index, content});
      });
    });
    return result;
  }

  let state = locationState();
  let sequence = 0;
  let busy = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reduced.matches && typeof Element.prototype.animate === 'function';

  function setControls() {
    choices.replaceChildren();
    controls.replaceChildren();
    const {id} = state;
    const data = pages.get(id);
    const atEnd = id === 'end';
    heading.textContent = atEnd ? 'Сцена завершена' : pages.get('start').title;
    freeze.hidden = atEnd;
    freeze.textContent = data?.question ? 'Стоп-кадр' : 'Разбор';
    thread.hidden = atEnd;
    thread.style.display = atEnd ? 'none' : '';
    scene.querySelector('.note').textContent = atEnd || forks.includes(id) ? '' : data.note;
    scene.querySelector('h2').textContent = atEnd ? '' : data.question;
    if (atEnd) {
      choices.append(catalogueLink(), button('forward','Пройти ещё раз', () => go('start')));
      return;
    }
    for (const {id:target,label} of data.links) {
      if (target === 'start') continue;
      const isRewind = data.review || Boolean(parents[id]);
      const container = isRewind ? controls : choices;
      container.append(button(isRewind ? 'rewind' : 'forward', label, () => go(target)));
    }
    const previous = pathFor(state).at(-2);
    if (previous && !data.links.some(link => link.id === previous)) {
      controls.append(button('rewind','На шаг назад', () => go(previous)));
    }
    if (data.review || parents[id]) controls.append(button('rewind','Перемотать в начало', () => go('start')));
    controls.append(button('finish','Завершить', askToEnd));
  }
  function go(id) {
    visit({id, fork:forks.includes(id) ? id : state.fork});
  }
  function visit(next) {
    if (busy && next.id !== 'end') return;
    history.pushState({sceneFork:next.fork}, '', '#'+next.id);
    render(next, true);
  }
  function askToEnd() {
    pauseMedia();
    dialog.showModal();
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
    freeze.hidden = true;
    typing.hidden = true;
    scene.querySelector('.note').textContent = '';
    question.textContent = '';
    choices.replaceChildren();
    controls.replaceChildren();
  }
  function intro() {
    ++sequence;
    finishWaiting();
    busy = false;
    pauseMedia();
    state = locationState();
    if (dialog.open) dialog.close();
    if (photo.open) photo.close();
    clearPrompt();
    heading.textContent = pages.get('start').title;
    thread.replaceChildren();
    thread.style.display = 'none';
    choices.append(button('forward', 'Старт', () => {
      history.replaceState({sceneFork:state.fork, started:true}, '', '#start');
      render({id:'start', fork:state.fork}, true);
    }, 'play'));
  }

  async function render(next, interactive) {
    const ticket = ++sequence;
    finishWaiting();
    pauseMedia();
    skip = !interactive || reduced.matches;
    followNew = interactive;
    busy = true;
    clearPrompt();
    if (dialog.open) dialog.close();
    if (photo.open) photo.close();
    thread.getAnimations({subtree:true}).forEach(animation => animation.cancel());
    const items = messages(next);
    const current = [...thread.children];
    let common = 0;
    while (common < current.length && common < items.length && current[common].dataset.key === items[common].key) common++;
    const removed = current.slice(common).reverse();
    const motion = interactive && motionAllowed() && next.id !== 'end';
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
    heading.textContent = active ? pages.get('start').title : 'Сцена завершена';
    thread.hidden = next.id === 'end';
    thread.style.display = thread.hidden ? 'none' : '';
    if (next.id !== 'end') {
      controls.append(button('dismiss', 'Показать сразу', finishWaiting, 'play'),
        button('finish', 'Завершить', askToEnd));
    }
    for (const [i, item] of items.slice(common).entries()) {
      const onStep = item.step === next.id;
      const name = item.content.querySelector('strong')?.textContent.split(' · ')[0];
      if (!skip && onStep && name) {
        const incoming = name !== 'Ты' && name !== 'Ремарка';
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
        if (dialog.open) await new Promise(resolve => dialog.addEventListener('close', resolve, {once:true}));
        if (ticket !== sequence) return;
      }
      typing.hidden = true;
      const row = element('div', 'item');
      row.dataset.key = item.key;
      row.dataset.step = item.step;
      if (item.content.dataset.context) row.append(element('p', 'chat-context', item.content.dataset.context));
      row.append(item.content);
      thread.append(row);
      if (onStep && followNew && (!skip || i === 0) && row.getBoundingClientRect().bottom > window.innerHeight) {
        row.scrollIntoView({block:'nearest', behavior:'instant'});
      }
      if (motion && onStep && !skip) row.animate([{opacity:0, transform:'translateY(6px)'},{opacity:1, transform:'none'}],
        {duration:160, easing:'ease-out'});
    }
    if (!skip && active) {
      await delay(400);
      if (ticket !== sequence) return;
      if (dialog.open) await new Promise(resolve => dialog.addEventListener('close', resolve, {once:true}));
      if (ticket !== sequence) return;
    }
    setControls();
    if (motion && !skip && active?.question) {
      thread.animate([{boxShadow:'0 0 0 3px #b4d6bb'},{boxShadow:'0 0 0 0 transparent'}], {duration:650, easing:'ease-out'});
      freeze.animate([{opacity:.3},{opacity:1}], {duration:240});
    }
    if (interactive) {
      const target = active ? (active.question ? question : freeze) : heading;
      target.tabIndex = -1;
      if (followNew) {
        target.focus({preventScroll:true});
        if (next.id === 'end' || items.length === common) target.scrollIntoView({block:'nearest', behavior:'instant'});
      }
      status.textContent = active?.question ? 'Стоп-кадр. ' + active.question : heading.textContent;
    }
    scene.removeAttribute('aria-busy');
    busy = false;
  }
  function fromAddress(interactive) {
    const next = locationState();
    if (next.id === 'start' && !history.state?.sceneFork) intro();
    else render(next, interactive);
  }
  window.addEventListener('popstate', () => fromAddress(true));
  fromAddress(false);
}
