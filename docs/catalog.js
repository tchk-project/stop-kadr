'use strict';

const isAttentionPilot = document.body?.hasAttribute('data-attention-pilot') === true;
const selectedRole = document.querySelector('.roles a[aria-current="page"]');
const params = new URLSearchParams(location.search);
const role = isAttentionPilot ? (params.get('role') === 'self' ? 'self' : 'witness') : selectedRole.dataset.role;
const personalRole = role === 'self';
const currentFile = isAttentionPilot ? (personalRole ? './self.html' : './index.html') : selectedRole.getAttribute('href');
const selection = params.get('case') || (isAttentionPilot ? 'money' : null);
const episode = [...scenarios,...healthScenes].find(item => item.id === selection);
const rehearsal = {id:'dubl', title:'Дубль для своих', place:'Школьная музыкальная группа', actors:{witness:'Тимур', self:'Миша'}};
const allStories = [rehearsal, ...scenarios, ...healthScenes];
const activeStory = episode || rehearsal;
const playerName = activeStory.actors[role];
const originalSelected = selection === 'dubl' || (!selection && location.hash.length > 1);
const isCatalogue = !isAttentionPilot && !episode && !originalSelected;
function focusLink(id, pointOfView) {
  return './focus.html?case='+encodeURIComponent(id)+'&role='+pointOfView+'&v=reading-1';
}
function randomStoryUrl(excludeId) {
  const pool = allStories.filter(item => item.id !== excludeId);
  return focusLink(pool[Math.floor(Math.random() * pool.length)].id, role);
}

// Turn off the temporary shortcuts after the editorial read-through.
const reviewNavigationEnabled = true;
function reviewerLink(label) {
  if (!reviewNavigationEnabled) return document.createDocumentFragment();
  const link = element('a','reviewer-link',label+' (для проверяющих)');
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

function bubbleFromPair([who, words, context, reactions]) {
  const bubble = element('div', who.startsWith('Ты') ? 'msg you' : 'msg');
  if (context) bubble.dataset.context = context;
  if (reactions) bubble.dataset.reactions = JSON.stringify(reactions);
  bubble.append(element('strong', '', who));
  if (typeof words === 'string') {
    bubble.append(element('p', '', words));
    return bubble;
  }
  bubble.classList.add(words.kind);
  const media = element('div', 'chat-media');
  if (words.caption) media.append(element('p', '', words.caption));
  if (words.kind === 'voice') {
    if (words.live) {
      bubble.classList.add('live-voice');
      media.append(element('p', '', words.transcript));
    }
    const audio = element('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = words.live ? words.src + '?v=cast-1' : words.src;
    audio.setAttribute('aria-label', (words.live ? 'Реплика в голосовом канале · ' : 'Голосовое · ') + (who === 'Ты' ? playerName : who));
    const transcript = element('details', 'transcript');
    transcript.append(element('summary', '', 'Текст голосового'), element('p', '', words.transcript));
    media.append(audio);
    if (!words.live) media.append(transcript);
  } else if (words.kind === 'video') {
    const video = element('video');
    video.controls = video.playsInline = true;
    video.preload = 'none';
    video.src = words.src;
    video.poster = words.poster;
    video.setAttribute('aria-label',words.caption);
    media.append(video);
  } else if (words.kind === 'sticker') {
    const image = element('img');
    image.src = words.src;
    image.alt = words.alt;
    image.width = image.height = 100;
    media.append(element('span', 'reply-to', personalRole ? 'На твоё голосовое' : 'На голосовое Леры'), image);
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

function loadEpisode(pages, item) {
  pages.clear();
  const story = item[role];
  const options = story.observations.map(([label], i) => ({label, id:'notice-'+i}));
  const branching = Boolean(story.otherContinuation);
  const versions = branching ? [
    {id:'later', label:story.continuationLabel},
    {id:'other-later', label:story.otherContinuation.label}
  ] : [];
  pages.set('start', {
    title:item.title, question:story.question, note:'',
    lines:story.opening.map(bubbleFromPair), links:options
  });

  function endings(part, prefix, parent, compare) {
    const links = part.actions.map(([label], i) => ({label, id:prefix+'act-'+i}));
    part.actions.forEach(([title, words, note, context, headline], i) => {
      const who = typeof words === 'string' && words.startsWith('Ты ') ? 'Ремарка' : 'Ты';
      const lines = Array.isArray(words) ? words : [[who, words, context]];
      pages.set(links[i].id, {
        title, parent, question:'', note, outcome:{kind:'positive', headline},
        lines:lines.map(bubbleFromPair), links:compare, review:true
      });
    });
    const alternative = part.alternative;
    if (alternative) {
      const id = prefix+'consequence';
      links.splice(alternative.position, 0, {id, label:alternative.label});
      pages.set(id, {
        title:alternative.label, parent, question:'', note:alternative.note,
        outcome:{kind:alternative.kind || 'negative', headline:alternative.headline},
        lines:alternative.lines.map(bubbleFromPair), links:compare, review:true
      });
    }
    return links;
  }

  let choices = versions;
  if (branching) {
    versions.forEach((version, i) => {
      const part = i === 0 ? story : story.otherContinuation;
      const other = versions[1-i];
      const compare = [{id:other.id, label:'Сравнить: '+other.label}];
      const links = endings(part, i === 0 ? '' : 'other-', version.id, compare);
      pages.set(version.id, {
        title:item.title, question:part.prompt, note:'', continuation:version.label,
        lines:part.later.map(bubbleFromPair), links
      });
    });
  } else {
    choices = endings(story, '', undefined, []);
  }
  story.observations.forEach(([, note], i) => {
    pages.set(options[i].id, {
      title:item.title, question:branching ? 'Что сделает Миша? Выбери продолжение, потом можно посмотреть второе.' : story.prompt, note,
      lines:branching ? [] : story.later.map(bubbleFromPair), links:choices
    });
  });
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
  change.append(reply,mode,note);
  const swap = element('button','take-toggle');
  swap.type = 'button';

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
  preview.append(channel,original,change,swap);
  return preview;
}

function cooperOverview(article) {
  const guide = element('section','home-guide');
  guide.setAttribute('aria-labelledby','home-guide-title');
  const title = element('h2','','🎨 Цветовые коды Купера');
  title.id = 'home-guide-title';
  guide.append(title);
  const levels = [
    ['⬜ Белый — совсем отвлёкся','📱 «Иду и смотрю только в экран».','Отложи телефон и посмотри вокруг.'],
    ['🟨 Жёлтый — внимательный и спокойный','👀 «Я замечаю, что происходит вокруг».','Продолжай идти и спокойно замечай, что меняется вокруг.'],
    ['🟧 Оранжевый — что-то насторожило','🤔 «Тут что-то не так. Пойду туда, где безопаснее».','Держи дистанцию и направляйся к людям или знакомому взрослому.'],
    ['🟥 Красный — действую сейчас','🗣️ «Мне нужна помощь!»','Если опасность угрожает тебе, уходи к людям и громко зови на помощь. Если кому-то рядом резко стало плохо, вызови скорую.']
  ];
  const grid = element('div','home-levels');
  for (const [name,quote,action] of levels) {
    const item = element('section','home-level');
    const advice = element('p');
    advice.append(element('strong','','Что делать: '),action);
    item.append(element('h3','',name),element('p','level-quote',quote),advice);
    grid.append(item);
  }
  const black = element('aside','home-level home-black');
  black.append(element('h3','','🖤 Чёрный — растерялся'),element('p','level-quote','😵 «Я не понимаю, что происходит!»'),
    element('p','','Растеряться можно в любой момент. Если это случилось, начни с одного действия — позови на помощь.'));
  const more = element('div','home-guide-more');
  more.append(article);
  guide.append(grid,black,more);
  return guide;
}

function showCatalogue(panel) {
  panel.querySelectorAll('.page').forEach(el => el.remove());
  const section = element('section','catalogue');
  const roles = panel.querySelector('.roles');
  const masthead = panel.querySelector('.top');
  document.body.classList.add('catalog-home');
  const listOpen = reviewNavigationEnabled && params.get('view') === 'cases';
  const home = element('a','wordmark','Стоп-кадр');
  home.href = currentFile;
  masthead.replaceChildren(home);
  document.title = listOpen ? 'Выбор ситуации · Стоп-кадр' : 'Стоп-кадр · Тренажёр внимания';
  const article = element('a','cooper-link','Подробнее о цветах Купера');
  article.href = './cooper.html';
  article.target = '_blank';
  article.rel = 'noopener';
  if (!listOpen) {
    masthead.append(reviewerLink('Выбрать ситуацию'));
    const hero = element('div','catalog-hero');
    const copy = element('div','hero-copy');
    const title = element('h1','','Тренажёр ');
    title.append(element('em','','внимания'));
    const intro = element('p','intro-copy','В «Стоп-кадре» ты выбираешь, как действовать по ходу истории. Так можно потренироваться замечать перемены и осознанно переходить от одного ');
    const levelsLink = element('a','','уровня внимания');
    levelsLink.href = '#home-guide-title';
    intro.append(levelsLink,' к другому.');
    copy.append(title,intro,
      element('p','how-to-play','Когда история остановится, выбери ответ. Потом можно отмотать её назад и попробовать другой вариант.'));
    const start = element('button','start-game','Начать тренировку');
    start.type = 'button';
    start.onclick = () => location.assign(randomStoryUrl());
    copy.append(element('p','role-prompt','С чьей стороны сыграешь?'), roles, start);
    hero.append(copy,makeTakePreview());
    article.textContent = 'Подробнее о цветовых кодах Купера →';
    section.append(hero,cooperOverview(article));
    panel.append(section);
    return;
  }
  const title = element('h1','','Выбери ситуацию');
  section.append(title,element('p','list-info',allStories.length+' историй · У каждой две роли'));
  roles.querySelectorAll('a').forEach(link => { link.search = '?view=cases'; });
  section.append(roles);
  const cards = element('div','case-grid');
  allStories.forEach(item => {
    const card = element('a','case-card');
    card.href = focusLink(item.id,role);
    const health = healthScenes.includes(item);
    const context = health ? item.place+' · '+(personalRole ? 'Симптомы у меня' : 'Я очевидец') : item.place;
    card.append(element('span','case-place',context), element('span','case-name',item.title));
    cards.append(card);
  });
  section.append(cards);
  const foot = element('footer','catalog-foot');
  foot.append(article);
  section.append(foot);
  panel.append(section);
}

function linkCurrentEpisode() {
  const id = episode?.id || 'dubl';
  document.querySelectorAll('.roles a').forEach(a => {
    a.href = focusLink(id,a.dataset.role);
    if (healthScenes.includes(episode) && a.dataset.role === 'self') a.textContent = 'Симптомы у меня';
    if (a.dataset.role === role) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
  const home = element('a','scene-home','Стоп-кадр');
  home.href = currentFile;
  document.querySelector('.top').replaceChildren(home,reviewerLink('К списку ситуаций'));
}
