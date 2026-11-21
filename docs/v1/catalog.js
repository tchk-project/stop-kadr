'use strict';

const selectedRole = document.querySelector('.roles a[aria-current="page"]');
const role = selectedRole.dataset.role;
const personalRole = role === 'self';
const currentFile = selectedRole.getAttribute('href');
const selection = new URLSearchParams(location.search).get('case');
const episode = scenarios.find(item => item.id === selection);
const rehearsal = {id:'dubl', title:'Дубль для своих', place:'Школьная музыкальная группа', actors:{witness:'Тимур', self:'Миша'}};
const activeStory = episode || rehearsal;
const playerName = activeStory.actors[role];
const originalSelected = selection === 'dubl' || (!selection && location.hash.length > 1);
const isCatalogue = !episode && !originalSelected;
const catalogueLink = () => {
  const a = document.createElement('a');
  a.href = currentFile;
  a.className = 'to-catalog';
  a.textContent = 'Все ситуации';
  return a;
};

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

function showCatalogue(panel) {
  panel.querySelectorAll('.page').forEach(el => el.remove());
  document.title = 'Стоп-кадр · '+selectedRole.textContent;
  const section = element('section','catalogue');
  const catalog = [rehearsal, ...scenarios];
  const heading = personalRole ? 'Что делать, если на меня давят?' : 'Как помочь, если на кого-то давят?';
  const intro = personalRole
    ? 'Это игра про школьные переписки. Здесь давят на тебя. Можно попробовать разные ответы, попросить поддержки и посмотреть, что будет дальше.'
    : 'Это игра про школьные переписки. Представь: весь чат смеётся над голосовым, а его автор замолчал. Как понять, что с ним, и чем помочь? Здесь можно попробовать разные ответы.';
  section.append(element('p','small',catalog.length+' школьных историй'), element('h1','',heading),
    element('p','catalog-intro',intro));
  const guide = element('div','catalog-guide');
  guide.append(element('h2','','Как играть'));
  const steps = element('ol','');
  for (const step of [
    'Выбери роль вверху и открой любую историю ниже. Сообщения появятся сами.',
    'На стоп-кадре нажми на один из ответов. Переписка продолжится, и ты увидишь, к чему привёл выбор.',
    'В конце нажми «Разобрать детали», чтобы узнать, какие слова и поступки стоило заметить. Хочешь попробовать иначе — вернись на шаг назад.'
  ]) steps.append(element('li','',step));
  guide.append(steps);
  section.append(guide);
  const cards = element('div','case-grid');
  catalog.forEach(item => {
    const card = element('a','case-card');
    card.href = currentFile+'?case='+item.id+'#start';
    card.append(element('span','case-place',item.place), element('span','case-name',item.title));
    cards.append(card);
  });
  section.append(cards);
  panel.append(section);
}

function linkCurrentEpisode() {
  const id = episode?.id || 'dubl';
  document.querySelectorAll('.roles a').forEach(a => {
    a.href = a.getAttribute('href')+'?case='+id+'#start';
  });
  document.querySelector('.top').append(catalogueLink());
}
