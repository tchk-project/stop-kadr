'use strict';

const personalRole = location.pathname.endsWith('/self.html');
const role = personalRole ? 'self' : 'witness';
const currentFile = personalRole ? './self.html' : './index.html';
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
  const name = bubble.querySelector('strong').textContent.split(' · ')[0];
  if (name === 'Ремарка') {
    bubble.classList.add('stage-note');
    return;
  }
  const index = avatarSlots[name];
  if (index === undefined) return;
  const avatar = element('span','avatar');
  avatar.setAttribute('aria-hidden','true');
  avatar.style.backgroundPosition = ((index % 4) * 100 / 3) + '% ' + (Math.floor(index / 4) * 100 / 3) + '%';
  bubble.classList.add('has-avatar');
  bubble.prepend(avatar);
}

function bubbleFromPair([who, words]) {
  const bubble = element('div', who.startsWith('Ты') ? 'msg you' : 'msg');
  bubble.append(element('strong', '', who), element('p', '', words));
  return bubble;
}

function loadEpisode(pages, item) {
  pages.clear();
  const story = item[role];
  const options = story.observations.map(([label], i) => ({label, id:'notice-'+i}));
  const responses = story.actions.map(([label], i) => ({label, id:'act-'+i}));
  pages.set('start', {
    title:item.title, question:story.question, note:'',
    lines:story.opening.map(bubbleFromPair), links:options
  });
  story.observations.forEach(([, note], i) => {
    pages.set(options[i].id, {
      title:item.title, question:story.prompt, note,
      lines:story.later.map(bubbleFromPair), links:responses
    });
  });
  story.actions.forEach(([title, words, note], i) => {
    // Narrative actions are stage directions and do not appear as speech from the participant.
    const who = words.startsWith('Ты ') ? 'Ремарка' : 'Ты';
    pages.set(responses[i].id, {
      title, question:'', note, lines:[bubbleFromPair([who, words])], links:[], review:true
    });
  });
}

function showCatalogue(panel) {
  panel.querySelectorAll('.page').forEach(el => el.remove());
  document.title = 'Стоп-кадр · '+(personalRole ? 'Давят на меня' : 'Я очевидец');
  const section = element('section','catalogue');
  const catalog = [{id:'dubl', title:'Дубль для своих', place:'Школьная музыкальная группа'}, ...scenarios];
  const intro = personalRole ? 'Тебя касается то, что происходит. Выбери ситуацию и попробуй разные ответы.' :
    'Ты видишь, что происходит рядом. Выбери ситуацию и реши, как отреагировать.';
  section.append(element('p','small','11 ситуаций'), element('h1','','Как поступить?'), element('p','catalog-intro',intro));
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
