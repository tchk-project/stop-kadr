'use strict';

const panel = document.querySelector('.panel');
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
const forks = ['joke', 'permission', 'unclear'];
const parents = {readrespect:'respect', cautious:'respect', group:'pressure', direct:'pressure', wait:'pressure'};
const shapes = {
  forward: '<path d="M4 4h16v12H9l-5 4z"/>',
  rewind: '<path d="m12 5-8 7 8 7zM21 5l-8 7 8 7z"/>',
  finish: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
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
  <button type="button" class="history-toggle" aria-controls="messages" aria-expanded="false" hidden>Показать предыдущие сообщения</button>
  <div class="thread" id="messages" role="region" aria-label="История переписки"></div>
  <p class="note"></p><h2></h2>
  <nav class="choices" aria-label="Продолжить беседу"></nav>
  <nav class="tools" aria-label="Управление сценой"></nav>
  <div class="sr" role="status"></div>`;
panel.querySelectorAll('.page').forEach(el => el.remove());
panel.append(scene);
const heading = scene.querySelector('h1');
const thread = scene.querySelector('.thread');
const historyToggle = scene.querySelector('.history-toggle');
const choices = scene.querySelector('.choices');
const controls = scene.querySelector('.tools');
const status = scene.querySelector('[role=status]');
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
  return {id, fork:forks.includes(id) ? id : forks.includes(saved) ? saved : 'unclear'};
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
      const marker = document.createElement('p');
      marker.className = 'choice-mark';
      marker.textContent = 'Твой выбор · ' + decision.label;
      result.push({step:id, key:id+'-choice', content:marker});
    }
    data.lines.forEach((line, index) => {
      const content = line.cloneNode(true);
      if (id === 'direct') content.querySelector('strong').textContent = 'Ты · лично Мише';
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
  heading.textContent = atEnd ? 'Сцена завершена' : data.title;
  thread.hidden = atEnd;
  thread.style.display = atEnd ? 'none' : '';
  scene.querySelector('.note').textContent = atEnd ? '' : data.note;
  scene.querySelector('h2').textContent = atEnd ? '' : data.question;
  if (atEnd) {
    choices.append(button('forward','Пройти ещё раз', () => go('start')));
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
  controls.append(button('finish','Завершить', () => dialog.showModal()));
}
function go(id) {
  visit({id, fork:forks.includes(id) ? id : state.fork});
}
function visit(next) {
  if (busy) return;
  history.pushState({sceneFork:next.fork}, '', '#'+next.id);
  render(next, true);
}
function showHistory(expanded) {
  let hasEarlier = false;
  for (const row of thread.children) {
    const earlier = row.dataset.step !== state.id;
    if (earlier) hasEarlier = true;
    row.hidden = earlier && !expanded;
  }
  historyToggle.hidden = !hasEarlier;
  historyToggle.setAttribute('aria-expanded', String(expanded));
  historyToggle.textContent = expanded ? 'Свернуть предыдущие сообщения' : 'Показать предыдущие сообщения';
}
historyToggle.addEventListener('click', () => {
  if (!busy) showHistory(historyToggle.getAttribute('aria-expanded') !== 'true');
});

async function render(next, interactive) {
  const ticket = ++sequence;
  busy = true;
  if (dialog.open) dialog.close();
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
      if (row.hidden) {
        row.remove();
        continue;
      }
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
  setControls();
  for (const [i, item] of items.slice(common).entries()) {
    const row = document.createElement('div');
    row.className = 'item';
    row.dataset.key = item.key;
    row.dataset.step = item.step;
    row.append(item.content);
    thread.append(row);
    if (motion) row.animate([{opacity:0, transform:'translateY(8px)'},{opacity:1, transform:'none'}],
      {duration:170, delay:i*32, fill:'backwards'});
  }
  showHistory(false);
  if (interactive) {
    heading.focus({preventScroll:true});
    if (heading.getBoundingClientRect().top < 0) heading.scrollIntoView({block:'start', behavior:'instant'});
    status.textContent = removed.length && next.id !== 'end' ? 'Перемотка завершена. '+heading.textContent : heading.textContent;
  }
  scene.removeAttribute('aria-busy');
  busy = false;
}
window.addEventListener('popstate', () => render(locationState(), true));
render(state, false);
