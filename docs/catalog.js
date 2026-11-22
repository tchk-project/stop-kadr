'use strict';

const isAttentionPilot = document.body?.hasAttribute('data-attention-pilot') === true;
const selectedRole = document.querySelector('.roles a[aria-current="page"]');
const params = new URLSearchParams(location.search);
const role = isAttentionPilot ? (params.get('role') === 'self' ? 'self' : 'witness') : selectedRole.dataset.role;
const personalRole = role === 'self';
const currentFile = isAttentionPilot ? (personalRole ? './self.html' : './index.html') : selectedRole.getAttribute('href');
const selection = params.get('case') || (isAttentionPilot ? 'money' : null);
const episode = allStories.find(item => item.id === selection);
const activeStory = episode || allStories[0];
const playerName = activeStory.roles[role].name;
const originalSelected = selection === 'dubl' || (!selection && location.hash.length > 1 && location.hash !== '#home-guide-title');
const isCatalogue = !isAttentionPilot && !episode && !originalSelected;
function focusLink(id, pointOfView) {
  const page = document.body?.hasAttribute('data-preview') ? './editor-preview.html' : './focus.html';
  return page+'?case='+encodeURIComponent(id)+'&role='+pointOfView+'&v=release-5';
}
function randomStoryUrl(excludeId, startingRole = role) {
  const pool = allStories.filter(item => item.id !== excludeId);
  return focusLink(pool[Math.floor(Math.random() * pool.length)].id, startingRole);
}

function catalogLink(label) {
  const link = element('a','catalog-link',label);
  link.href = currentFile+'?view=cases';
  return link;
}

const avatarSlots = {
  'Вера':0, 'Миша':1, 'Костя':2, 'Саша':3, 'Даня':4,
  'Аня':5, 'Тимур':6, 'Лёша':7, 'Лера':10, 'Админ':9,
  'Мама Саши':8, 'Модератор игры':12, 'Марина Сергеевна':13, 'Тренер':14
};

function element(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value) el.textContent = value;
  return el;
}

function portrait(name) {
  const index = avatarSlots[name];
  if (index === undefined) return null;
  const avatar = element('span','avatar');
  avatar.setAttribute('aria-hidden','true');
  avatar.style.backgroundPosition = ((index % 4) * 100 / 3) + '% ' + (Math.floor(index / 4) * 100 / 3) + '%';
  return avatar;
}

function addAvatar(bubble) {
  if (bubble.dataset.reactions) {
    const group = element('div', 'reactions');
    for (const [emoji, names] of Object.entries(JSON.parse(bubble.dataset.reactions))) {
      const details = element('details', 'reaction');
      const button = element('summary');
      button.setAttribute('aria-label', 'Реакция ' + emoji + ', ' + names.length + '. Кто отреагировал');
      button.append(element('span', '', emoji), element('span', '', String(names.length)));
      const list = element('span', 'reactors');
      for (const name of names) {
        const reactor = element('span', 'reactor');
        const avatar = portrait(name);
        if (avatar) reactor.append(avatar);
        reactor.append(name === playerName ? 'Ты · '+name : name);
        list.append(reactor);
      }
      details.append(button, list);
      group.append(details);
    }
    bubble.append(group);
  }
  const label = bubble.querySelector('strong');
  const [name, ...context] = label.textContent.split(' · ');
  if (name === 'Система') {
    bubble.classList.add('system-event');
    return;
  }
  if (name === 'Ремарка') {
    bubble.classList.add('stage-note');
    return;
  }
  const actor = name === 'Ты' ? playerName : name;
  if (actor === playerName) {
    label.textContent = ['Ты', actor, ...context].join(' · ');
    bubble.classList.add('you');
  }
  const avatar = portrait(actor);
  if (!avatar) return;
  bubble.classList.add('has-avatar');
  bubble.prepend(avatar);
}

function recordingButton(src, label) {
  const play = element('button', 'play-audio', 'Прослушать');
  play.type = 'button';
  play.dataset.src = src;
  play.setAttribute('aria-label', 'Прослушать · '+label);
  play.addEventListener('click', () => {
    const audio = element('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.setAttribute('aria-label', label);
    audio.src = src;
    play.replaceWith(audio);
    audio.focus();
    audio.play().catch(error => {
      if (error.name === 'AbortError' || !audio.isConnected) return;
      const hadFocus = document.activeElement === audio;
      play.textContent = 'Не удалось воспроизвести. Повторить';
      play.setAttribute('aria-label', play.textContent+' · '+label);
      audio.replaceWith(play);
      if (hadFocus) play.focus();
    });
  });
  return play;
}

function messageBubble(message) {
  const {speaker, aside, reactions, media:words, parts} = message;
  const who = aside ? speaker+' · '+aside : speaker;
  const bubble = element('div', speaker === 'Ты' ? 'msg you' : 'msg');
  function paragraph(text) {
    const p = element('p', '', text);
    if (parts?.quote && (text === parts.text || text.includes('[['))) {
      const span = element('span', 'cue-words', parts.quote);
      p.replaceChildren(parts.before, span, parts.after);
    }
    return p;
  }
  if (reactions) bubble.dataset.reactions = JSON.stringify(reactions);
  bubble.append(element('strong', '', who));
  if (!words) {
    bubble.append(paragraph(parts.text));
    return bubble;
  }
  bubble.classList.add(words.kind);
  const media = element('div', 'chat-media');
  if (words.caption) media.append(paragraph(words.caption));
  if (words.kind === 'voice') {
    if (words.live) {
      bubble.classList.add('live-voice');
      media.append(paragraph(words.transcript));
    }
    const src = words.src.startsWith('./assets/') ? words.src + '?v=voices-2' : words.src;
    const speakerName = speaker === 'Ты' ? playerName : speaker;
    const phrase = parts.text.trim().split(/\s+/);
    const excerpt = phrase.slice(0,8).join(' ') + (phrase.length > 8 ? '…' : '');
    const label = [words.live ? 'Реплика в голосовом канале' : 'Голосовое',
      speakerName, aside, message.caption, excerpt].filter(Boolean).join(' · ');
    const transcript = element('details', 'transcript');
    transcript.append(element('summary', '', 'Текст голосового'), paragraph(words.transcript));
    media.append(recordingButton(src, label));
    if (!words.live) media.append(transcript);
  } else if (words.kind === 'video') {
    const video = element('video');
    video.controls = video.playsInline = true;
    video.preload = 'none';
    video.src = words.src;
    video.poster = words.poster;
    video.setAttribute('aria-label',words.caption);
    if (words.captions) {
      const track = element('track');
      track.kind = 'captions';
      track.srclang = 'ru';
      track.label = 'Русские субтитры';
      track.src = location.protocol === 'file:' && words.captionsText
        ? 'data:text/vtt;charset=utf-8,' + encodeURIComponent(words.captionsText)
        : words.captions;
      track.default = true;
      video.append(track);
    }
    const figure = element('figure','clip');
    figure.append(video);
    if (words.description) figure.append(element('figcaption','clip-caption',words.description));
    media.append(figure);
  } else if (words.kind === 'sticker') {
    const image = element('img');
    image.src = words.src;
    image.alt = words.alt;
    image.width = image.height = 100;
    if (message.reply) media.append(element('span', 'reply-to', message.reply));
    media.append(image);
  } else {
    const image = element('img', 'preview');
    image.src = words.src;
    image.alt = words.alt;
    if (words.kind === 'document') {
      const file = element('a', 'file-card');
      file.href = words.file;
      file.target = '_blank';
      file.rel = 'noopener';
      file.append(image, element('span', '', 'Открыть презентацию · PDF'));
      media.append(file);
      if (words.html) {
        const slides = element('a','slide-text','Прочитать слайды текстом');
        slides.href = words.html;
        slides.target = '_blank';
        slides.rel = 'noopener';
        media.append(slides);
      }
    } else {
      const open = element('button', 'open-image');
      open.type = 'button';
      open.setAttribute('aria-label', 'Увеличить скриншот. ' + words.alt);
      open.append(image, element('span', '', 'Увеличить скриншот'));
      media.append(open);
    }
  }
  bubble.append(media);
  return bubble;
}

function makeTakePreview() {
  const preview = element('section','take-preview');
  preview.setAttribute('aria-label','Два ответа на одну реплику');
  function bubble(name, text) {
    const row = element('div','preview-row');
    row.append(portrait(name),element('strong','',name),element('p','',text));
    return row;
  }
  const original = bubble('Саша','Я на подарок в этот раз не скидываюсь.');
  const reply = bubble('Даня','');
  const words = reply.querySelector('p');
  const mode = element('p','preview-mode');
  const note = element('p','preview-note');
  const change = element('div','preview-change');
  change.setAttribute('aria-live','polite');
  change.setAttribute('aria-atomic','true');
  change.append(reply);
  const swap = element('button','take-toggle');
  swap.type = 'button';
  mode.id = 'example-mode';
  note.id = 'example-meaning';
  swap.setAttribute('aria-describedby', 'example-mode example-meaning');

  function render(code) {
    const pressure = code === 'orange';
    preview.dataset.code = code;
    const {name,meaning} = attentionModes[code];
    mode.textContent = name+' · '+meaning;
    if (pressure) words.replaceChildren('Тогда с тебя ',element('mark','','двести'),'.');
    else words.textContent = 'Ок, Саш, вычеркнул.';
    note.textContent = pressure ? 'Саша уже отказался. Даня всё равно требует деньги.' : 'Даня принял отказ Саши.';
    swap.textContent = pressure ? 'Вернуть первый ответ' : 'Сменить ответ Дани';
  }

  render('yellow');
  swap.onclick = () => {
    render(preview.dataset.code === 'yellow' ? 'orange' : 'yellow');
    if (reply.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      reply.animate([{opacity:.4,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:200});
  };
  const channel = element('header','preview-channel');
  channel.append(element('small','','Пример из игры'),element('strong','','Чат секции'));
  preview.append(channel,original,change,swap,mode,note);
  return preview;
}

function showCatalogue(panel) {
  panel.querySelectorAll('.page').forEach(el => el.remove());
  const section = element('section','catalogue');
  const roles = panel.querySelector('.roles');
  const masthead = panel.querySelector('.top');
  document.body.classList.add('catalog-home');
  const listOpen = params.get('view') === 'cases';
  const home = element('a','wordmark','Стоп-кадр');
  home.href = currentFile;
  masthead.replaceChildren(home);
  document.title = listOpen ? 'Выбор ситуации · Стоп-кадр' : 'Стоп-кадр · Игра';
  const article = element('a','cooper-link','Цвета в игре');
  article.href = './colors.html';
  article.target = '_blank';
  article.rel = 'noopener';
  if (!listOpen) {
    masthead.append(catalogLink('Выбрать историю'));
    const hero = element('div','catalog-hero');
    const copy = element('div','hero-copy');
    roles.remove();
    const title = element('h1','','Давай ');
    title.append(element('em','','поиграем?'));
    const intro = element('p','intro-copy','В школе и в чате бывает по-разному. Кто-то шутит, на кого-то давят, кому-то стало плохо. Что ты заметишь и как поступишь?');
    const start = element('button','start-game','Играть');
    start.type = 'button';
    start.onclick = () => location.assign(randomStoryUrl(undefined, Math.random() < .5 ? 'witness' : 'self'));
    article.id = 'home-guide-title';
    article.classList.add('home-colours-link');
    copy.append(title,intro,start,article);
    hero.append(copy,makeTakePreview());
    section.append(hero);
    panel.append(section);
    return;
  }
  const title = element('h1','','Выбери ситуацию');
  section.append(title,element('p','list-info',allStories.length+' историй · У каждой две роли'));
  roles.querySelectorAll('a').forEach(link => { link.search = '?view=cases'; });
  roles.hidden = false;
  section.append(roles);
  const cards = element('div','case-grid');
  allStories.forEach(item => {
    const card = element('a','case-card');
    card.href = focusLink(item.id,role);
    const health = item.article;
    const context = health ? item.place+' · '+(personalRole ? 'Симптомы у меня' : 'Я очевидец') : item.place;
    card.append(element('span','case-place',context), element('span','case-name',item.title));
    cards.append(card);
  });
  section.append(cards);
  const foot = element('footer','catalog-foot');
  const editor = element('a','catalog-link','Редактор историй');
  editor.href = './editor.html';
  foot.append(article,editor);
  section.append(foot);
  panel.append(section);
}

function linkCurrentEpisode() {
  const id = activeStory.id;
  document.querySelectorAll('.roles a').forEach(a => {
    a.href = focusLink(id,a.dataset.role);
    if (episode?.article && a.dataset.role === 'self') a.textContent = 'Симптомы у меня';
    if (a.dataset.role === role) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
  const home = element('a','scene-home','Стоп-кадр');
  home.href = currentFile;
  document.querySelector('.top').replaceChildren(home);
}
