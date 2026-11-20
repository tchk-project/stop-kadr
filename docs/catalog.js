'use strict';

const selectedRole = document.querySelector('.roles a[aria-current="page"]');
const role = selectedRole.dataset.role;
const personalRole = role === 'self';
const currentFile = selectedRole.getAttribute('href');
const selection = new URLSearchParams(location.search).get('case');
const episode = scenarios.find(item => item.id === selection);
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
  'Марина Сергеевна':13, 'Тренер':14, 'Ты':15
};

function element(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value) el.textContent = value;
  return el;
}

function addAvatar(bubble) {
  if (bubble.dataset.reactions) {
    const group = element('div', 'reactions');
    for (const [emoji, names] of Object.entries(JSON.parse(bubble.dataset.reactions))) {
      const details = element('details', 'reaction');
      const button = element('summary');
      button.setAttribute('aria-label', 'Реакция ' + emoji + ', ' + names.length + '. Кто отреагировал');
      button.append(element('span', '', emoji), element('span', '', String(names.length)));
      details.append(button, element('span', 'reactors', names.join(', ')));
      group.append(details);
    }
    bubble.append(group);
  }
  const name = bubble.querySelector('strong').textContent.split(' · ')[0];
  if (name === 'Система') {
    bubble.classList.add('system-event');
    return;
  }
  if (name === 'Ремарка') {
    bubble.classList.add('stage-note');
    return;
  }
  const index = avatarSlots[name === 'Ты' && episode?.personalName ? episode.personalName : name];
  if (index === undefined) return;
  const avatar = element('span','avatar');
  avatar.setAttribute('aria-hidden','true');
  avatar.style.backgroundPosition = ((index % 4) * 100 / 3) + '% ' + (Math.floor(index / 4) * 100 / 3) + '%';
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
    audio.src = words.src;
    audio.setAttribute('aria-label', words.live ? 'Реплика в голосовом канале · ' + who : 'Голосовое Леры');
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
  const responses = story.actions.map(([label], i) => ({label, id:'act-'+i}));
  const alternative = story.alternative;
  const links = [...responses];
  if (alternative) {
    links.splice(alternative.position, 0, {id:'consequence', label:alternative.label});
    pages.set('consequence', {
      title:alternative.label, question:'', note:alternative.note,
      outcome:{kind:'negative', headline:alternative.headline},
      lines:alternative.lines.map(bubbleFromPair), links:[], review:true
    });
  }
  pages.set('start', {
    title:item.title, question:story.question, note:'',
    lines:story.opening.map(bubbleFromPair), links:options
  });
  story.observations.forEach(([, note], i) => {
    pages.set(options[i].id, {
      title:item.title, question:story.prompt, note,
      lines:story.later.map(bubbleFromPair), links
    });
  });
  story.actions.forEach(([title, words, note, context, headline], i) => {
    // Narrative actions are stage directions and do not appear as speech from the participant.
    const who = typeof words === 'string' && words.startsWith('Ты ') ? 'Ремарка' : 'Ты';
    const lines = Array.isArray(words) ? words : [[who, words, context]];
    pages.set(responses[i].id, {
      title, question:'', note, outcome:{kind:'positive', headline},
      lines:lines.map(bubbleFromPair), links:[], review:true
    });
  });
}

function showCatalogue(panel) {
  panel.querySelectorAll('.page').forEach(el => el.remove());
  document.title = 'Стоп-кадр · '+selectedRole.textContent;
  const section = element('section','catalogue');
  const catalog = [{id:'dubl', title:'Дубль для своих', place:'Школьная музыкальная группа'}, ...scenarios];
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
