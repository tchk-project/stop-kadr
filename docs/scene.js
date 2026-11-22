'use strict';

const panel = document.querySelector('.panel');
if (!episode) location.replace(currentFile);
else launchAttentionScene().catch(error => {
  console.error(error);
  panel.hidden = true;
  document.querySelector('.scene-loader').hidden = false;
  showLoadingError();
});

// Budget reading time after the message is visible, including context and media captions.
function readingPause(row) {
  const parts = row.querySelectorAll('p, .reply-to, .reaction-label');
  const text = Array.from(parts, part => part.textContent).join(' ');
  const words = text.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) || [];
  const mediaTime = row.querySelector('.chat-media, audio, video, .preview') ? 2000 : 0;
  return Math.max(2300, 500 + words.length * 500) + mediaTime;
}

function afterPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function launchAttentionScene() {
  const loader = document.querySelector('.scene-loader');
  loader.dataset.started = '';
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.onload = resolve;
    script.onerror = () => reject(new Error('Не удалось загрузить историю '+episode.id));
    script.src = './game/stories/'+episode.id+'.js?v=review-3';
    document.head.append(script);
  });
  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load',resolve,{once:true}));
  }
  await afterPaint();
  linkCurrentEpisode();
  await playScene();
}

function playScene() {
  const route = prepareRoute(storyData,role);
  const pages = new Map(Object.entries(route.story).map(([id,data]) => [id,{
    ...data, title:activeStory.title, links:data.links.map(([id,label]) => ({id,label})),
    outcome:data.outcome && {kind:data.outcome[0],headline:data.outcome[1]}
  }]));
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
    <h1 tabindex="-1"></h1>
    <p class="scene-role"></p>
    <div class="thread" id="messages" role="region" aria-label="История переписки"></div>
    <div class="typing" hidden><span class="typing-name"></span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
    <div class="screen-flash" aria-hidden="true"></div>
    <p class="freeze" hidden>Стоп-кадр</p>
    <section class="outcome" aria-labelledby="outcome-title" tabindex="-1" hidden>
      <p class="outcome-label">Чем закончился этот дубль</p>
      <h2 id="outcome-title"></h2><p class="outcome-reason"></p>
    </section>
    <p class="note"></p><h2 class="question" tabindex="-1"></h2>
    <p class="choice-hint" hidden>Переписка на паузе. Нажми на один из вариантов ниже, чтобы продолжить.</p>
    <nav class="choices" aria-label="Продолжить беседу"></nav>
    <nav class="tools" aria-label="Управление сценой"><div class="playback-controls"></div></nav>
    <div class="sr" role="status"></div>`;
  panel.querySelectorAll('.page').forEach(el => el.remove());
  if (episode?.article) {
    const reading = document.createElement('p');
    const link = document.createElement('a');
    link.href = episode.article;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Медицинская памятка · признаки и первая помощь';
    reading.append(link);
    scene.querySelector('.tools').after(reading);
  }
  panel.append(scene);
  const roleLine = scene.querySelector('.scene-role');
  const playerPortrait = portrait(playerName);
  if (playerPortrait) roleLine.append(playerPortrait);
  const who = {Папа:'папа Леры', Тренер:'тренер'}[playerName] || playerName;
  roleLine.append(element('span', '', 'Ты — '+who+'. '+activeStory.roles[role].intro));
  document.title = activeStory.title + ' · Стоп-кадр';
  const heading = scene.querySelector('h1');
  const thread = scene.querySelector('.thread');
  const typing = scene.querySelector('.typing');
  const flash = scene.querySelector('.screen-flash');
  const freeze = scene.querySelector('.freeze');
  const note = scene.querySelector('.note');
  const question = scene.querySelector('.question');
  const outcome = scene.querySelector('.outcome');
  const hint = scene.querySelector('.choice-hint');
  const choices = scene.querySelector('.choices');
  const controls = scene.querySelector('.playback-controls');
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

  function pathFor({id, path}) {
    return routePath(route.story,id,path);
  }

  function messages(location) {
    const result = [];
    const path = pathFor(location);
    path.forEach((id, i) => {
      const data = pages.get(id);
      if (i && !data.continuation) {
        const decision = pages.get(path[i-1]).links.find(link => link.id === id);
        const marker = document.createElement('div');
        marker.className = 'choice-mark';
        marker.append(element('p', '', data.continuation ? 'Возможное продолжение · '+data.continuation : 'Твой выбор · '+decision.label));
        const parent = pages.get(path[i-1]);
        const before = attentionAtLine(parent,parent.lines.length-1);
        const label = before === data.mode ? attentionModes[data.mode].name : attentionModes[before].name+' → '+attentionModes[data.mode].name;
        marker.prepend(element('p','mode-change',label));
        result.push({step:id, key:id+'-choice', ref:id+'/@choice', content:marker, attention:data.mode});
      }
      data.lines.forEach((line, index) => {
        const content = messageBubble(line);
        addAvatar(content);
        const reaction = data.reaction?.index === index;
        result.push({step:id, key:id+'-'+index, ref:line.ref, line, content, reaction,
          attention:attentionAtLine(data,index)});
      });
    });
    return result;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reduced.matches && typeof Element.prototype.animate === 'function';
  function makeRow(item, caption = item.content.dataset.context) {
    const row = element('div', 'item');
    row.dataset.key = item.key;
    row.dataset.step = item.step;
    row.dataset.ref = item.ref;
    if (caption) row.append(element('p', 'chat-context', caption));
    row.append(item.content);
    return row;
  }

  const modeLabel = document.querySelector('.mode-bar small');
  const modeBar = modeLabel.closest('.mode-bar');
  function showOutcome(data) {
    const {kind, headline} = data.outcome;
    outcome.dataset.kind = kind;
    outcome.querySelector('#outcome-title').textContent = headline;
    outcome.querySelector('.outcome-reason').textContent = data.note;
    outcome.hidden = false;
    modeLabel.textContent = 'Внимание в последнем решении';
    modeBar.setAttribute('aria-label', modeLabel.textContent);
    modeBar.classList.add('past-mode');
  }

  function finishScene() {
    pauseMedia();
    location.assign(currentFile);
  }
  let followNew = false;
  function stopFollowing() { followNew = false; }
  window.addEventListener('wheel', stopFollowing, {passive:true});
  window.addEventListener('touchmove', stopFollowing, {passive:true});
  document.addEventListener('pointerdown', stopFollowing);
  document.addEventListener('focusin', stopFollowing);
  scene.addEventListener('play', stopFollowing, true);
  window.addEventListener('keydown', event => {
    if (['Tab', ' ', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) stopFollowing();
  });

  function clearPrompt() {
    flash.getAnimations().forEach(animation => animation.cancel());
    freeze.getAnimations().forEach(animation => animation.cancel());
    freeze.hidden = true;
    outcome.hidden = true;
    modeLabel.textContent = 'Мой режим внимания';
    modeBar.setAttribute('aria-label', modeLabel.textContent);
    modeBar.classList.remove('past-mode');
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
    const stampColor = getComputedStyle(scene).getPropertyValue('--tint').trim();
    const stamp = {
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
      backgroundColor: stampColor, boxShadow: '0 0 0 4px '+stampColor
    };
    freeze.animate([
      stamp, {...stamp, offset: 0.16},
      {transform: 'none', backgroundColor: 'transparent', boxShadow: '0 0 0 0 transparent'}
    ], {duration: 680, easing: 'cubic-bezier(.3, 0, .2, 1)'});
  }
  return playAttentionPilot({route, pauseMedia, pages, pathFor, messages, makeRow, button, scene, heading, thread, typing,
      flash, freeze, question, outcome, choices, controls, status, finishScene,
      showOutcome, clearPrompt, flashFreeze, motionAllowed, reduced, setFollow: value => { followNew = value; },
      shouldFollow: () => followNew});
}
