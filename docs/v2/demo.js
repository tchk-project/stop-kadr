'use strict';

const questions = [
  {
    scene: 0, title: 'Сбор после уроков', place: 'Перемена · у столовой',
    intro: 'Потренируйся замечать, когда обычная ситуация меняется. В демо три истории. Выбери ответ и посмотри, какие детали его подтверждают.',
    context: 'Миша слышит, как ребята обсуждают подарок тренеру.',
    question: 'Нажми на реплику, после которой сбор стал давлением.',
    answers: [
      ['Скидываемся по сто на подарок тренеру.', 'Даня предложил сумму. Саша ещё может согласиться или отказаться. Посмотри, что Даня отвечает на отказ.', 'Даня'],
      ['Я в этот раз не участвую.', 'Саша просто сказал «нет». О деньгах в его семье мы ничего не знаем. Давление слышно в следующей реплике Дани.', 'Саша'],
      ['Тогда с тебя двести. После уроков тебя подождём.', 'За отказ Даня удвоил сумму и сказал, что будет ждать Сашу. Именно эти слова меняют смысл разговора.', 'Даня']
    ],
    correct: 2, success: 'Ты заметил, где началось давление', retry: 'Присмотрись к ответу на отказ',
    mode: 'Оранжевый', modeText: 'У Миши появился конкретный повод обратить внимание. Он может спросить Сашу наедине, хочет ли тот уйти вместе.',
    takeaway: 'После Сашиного «нет» Даня удвоил сумму и назначил встречу.'
  },
  {
    scene: 1, title: 'Шарики у подъезда', place: 'Двор · после школы',
    intro: 'Аня идёт домой через двор. Сначала у неё есть только следы на дорожке.',
    context: 'На сухой дорожке лежат обрывки двух шариков. Вокруг каждого — маленькая лужа.',
    photo: true, question: 'Какой вывод лучше всего объясняет следы?',
    answers: [
      ['Шарики могли быть наполнены водой.', 'Обрывки лежат прямо в лужицах. Вода в шариках объясняет обе детали. Откуда они взялись, пока неизвестно.'],
      ['Кто-то целился в прохожих.', 'Аня не видела, кто их бросал и были ли рядом прохожие. Пока обрывки в лужах подсказывают только то, чем могли быть наполнены шарики.'],
      ['Во дворе только что отмечали праздник.', 'После праздника тоже могли остаться шарики. Но Аня видит лишь обрывки и лужи, а про праздник пока ничего не знает.']
    ],
    correct: 0, success: 'Ты связал две видимые детали', retry: 'Для такого вывода не хватает сведений',
    mode: 'Жёлтый', modeText: 'Аня заметила следы и пока не знает, что случилось. Этого достаточно, чтобы присмотреться к дорожке.',
    takeaway: 'Обрывки в лужах подсказывают, что внутри могла быть вода. Кто и зачем бросал шарики, пока неизвестно.'
  },
  {
    scene: 1, title: 'Шарики у подъезда', place: 'Тот же двор · несколько секунд спустя',
    intro: 'Теперь у Ани есть ещё одно наблюдение. Можно пересмотреть первый вывод.',
    before: 'На дорожке лежали мокрые обрывки шариков.',
    update: 'Перед Аней на ту же дорожку падает ещё один шарик. Лопается, и брызги долетают до её кроссовок.',
    question: 'Что эта деталь меняет для Ани?',
    answers: [
      ['Теперь понятно, что целились именно в Аню.', 'Аня видела, куда упал шарик. В кого целились и целились ли вообще, по этому кадру всё ещё неясно.'],
      ['Шарики всё ещё падают. Можно обойти это место.', 'Раньше Аня видела только следы. Теперь знает, что шарики продолжают падать. Обойти дорожку можно уже сейчас.'],
      ['Сначала надо узнать, из какого окна бросают.', 'Номер окна пока неизвестен. Для выбора пути важнее другое — Аня только что увидела, куда падают шарики.']
    ],
    correct: 1, success: 'Ты пересмотрел решение по новой детали', retry: 'Вернись к тому, что Аня увидела сама',
    mode: 'Оранжевый', modeText: 'Новый шарик упал прямо на дорожку. У Ани появился конкретный повод пройти в стороне.',
    takeaway: 'Ещё один шарик упал при Ане. Она уже может обойти это место.'
  },
  {
    scene: 2, title: 'Оклик у остановки', place: 'Остановка · по дороге домой',
    intro: 'Тимур спешит на автобус. Кто-то сзади кричит: «Парень, подожди!» Тимур оборачивается.',
    before: 'Пока Тимур слышал только оклик.',
    update: 'Мужчина показывает на варежку под скамейкой: «У тебя из рюкзака выпала». Тимур заглядывает в рюкзак. Точно, из пары там осталась одна. Мужчина уже идёт дальше.',
    question: 'Какая деталь лучше всего объясняет, зачем его окликнули?',
    answers: [
      ['Мужчина громко крикнул вслед.', 'Громкий голос привлёк внимание. До следующей реплики Тимур ещё не знал, зачем его зовут.'],
      ['Оклик прозвучал у самого автобуса.', 'Место объясняет, почему Тимур торопился. А причина оклика стала понятнее, когда мужчина указал на конкретную вещь.'],
      ['Мужчина показал на пропавшую варежку.', 'Тимур смог проверить подсказку — в рюкзаке только одна варежка, вторая лежит под скамейкой. Этого достаточно, чтобы понять смысл оклика.']
    ],
    correct: 2, success: 'Ты заметил деталь, которая всё прояснила', retry: 'Что Тимур смог проверить сам?',
    mode: 'Жёлтый', modeText: 'Оклик привлёк внимание. Новые сведения объяснили его, и Тимур может вернуться к своим делам.',
    takeaway: 'Слова о варежке совпали с тем, что Тимур сам увидел.'
  }
];

const play = document.querySelector('#play');
const positions = {'Саша':'100% 0%', 'Даня':'0% 33.3333%'};
const marks = [...document.querySelectorAll('.track span')];
const catalogUrl = new URLSearchParams(location.search).get('role') === 'self' ? '../self.html' : '../index.html';
document.querySelector('.return').href = catalogUrl;
const saved = history.state?.stopKadrDemo;
let answers = Array.isArray(saved?.answers) && saved.answers.length <= questions.length
  && saved.answers.every((n, i) => Number.isInteger(n) && n >= 0 && n < questions[i].answers.length)
  ? saved.answers.slice() : [];
let index = Number.isInteger(saved?.index) && saved.index >= 0 && saved.index <= answers.length
  && saved.index >= answers.length - 1 ? saved.index : answers.length;

let stopRevealed = saved?.stopRevealed === true;

function remember() {
  history.replaceState({...history.state, stopKadrDemo: {index, answers: [...answers], stopRevealed}}, '');
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function link(label, href, cls) {
  const a = el('a', cls, label);
  a.href = href;
  return a;
}

function button(label, action) {
  const b = el('button', 'primary', label);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}

function focusAt(node) {
  node.tabIndex = -1;
  node.focus({preventScroll:true});
  if (node.getBoundingClientRect().top < 0 || node.getBoundingClientRect().bottom > innerHeight)
    node.scrollIntoView({block:'nearest'});
}

function relatedStory() {
  const block = el('details','related');
  block.append(el('summary','','Пройти полную историю про сбор'), el('p','','Выбери, за кого сыграть. К демо можно вернуться кнопкой «Назад» в браузере.'));
  block.append(link('За Мишу, очевидца','../index.html?case=money#start'), link('За Сашу, на которого давят','../self.html?case=money#start'));
  return block;
}

function renderResult() {
  const section = el('section','summary');
  const heading = el('h1','','Что ты заметил');
  const score = questions.filter((q,i) => answers[i] === q.correct).length;
  section.append(el('p','kicker','Демо пройдено · 3 ситуации'),heading,el('p','lead','Ответов с опорой на детали: '+score+' из '+questions.length+'.'));
  const list = el('div','scene');
  questions.forEach((q,i) => {
    const right = answers[i] === q.correct;
    const row = el('div','result-item'+(right ? '' : ' miss'));
    const title = i === 1 ? 'Шарики · первые следы' : i === 2 ? 'Шарики · новый кадр' : q.title;
    row.append(el('h3','',title),el('p','',right ? 'Ты заметил важную деталь.' : 'Стоило обратить внимание на другую деталь.'),el('p','',q.takeaway));
    list.append(row);
  });
  list.append(button('Пройти ещё раз',()=>{index=0; answers=[]; stopRevealed=false; remember(); render(true);}), link('К школьным историям',catalogUrl,'return-link'));
  section.append(list); play.replaceChildren(section);
  return heading;
}

function reveal(text, label) {
  const box = el('div','reveal');
  box.append(el('p','label',label),el('p','',text));
  return box;
}

function render(moveFocus = false, focusFeedback = false) {
  const q = questions[index];
  marks.forEach((mark,i) => { mark.className = !q || i < q.scene ? 'past' : i === q.scene ? 'here' : ''; });
  if (!q) { const h = renderResult(); if (moveFocus) focusAt(h); return; }

  const layout = el('section','layout');
  const intro = el('div','intro');
  const h = el('h1','',q.title);
  intro.append(el('p','kicker','Заметь, что изменилось · '+(q.scene+1)+' из 3'),h,el('p','lead',q.intro));
  const scene = el('div','scene');
  scene.append(el('p','label',q.place));
  if (q.photo) {
    const img = el('img','photo'); img.src = './courtyard.webp';
    img.alt = 'Обрывки шариков на мокрых пятнах перед подъездом.';
    scene.append(img);
  }
  if (q.context) scene.append(el('p','setting',q.context));
  if (q.before) scene.append(el('p','setting',q.before));
  if (q.scene === 2 && !stopRevealed && answers[index] === undefined) {
    scene.append(button('Посмотреть, что было дальше',()=>{
      stopRevealed = true;
      remember();
      render();
      focusAt(document.querySelector('.reveal'));
    }));
    layout.append(intro,scene); play.replaceChildren(layout);
    if (moveFocus) { window.scrollTo(0,0); focusAt(h); }
    return;
  }
  if (q.update) scene.append(reveal(q.update,'Следующий кадр'));
  const prompt = el('h2','prompt',q.question);
  prompt.id = 'prompt'; scene.append(prompt);
  const group = el('div','choices');
  group.setAttribute('role','group'); group.setAttribute('aria-labelledby','prompt');
  const chosen = answers[index];
  q.answers.forEach(([label,,speaker],i) => {
    const opt = el('button','option'); opt.type = 'button';
    const copy = el('span','');
    if (speaker) {
      const avatar = el('span','portrait'); avatar.style.backgroundPosition = positions[speaker]; avatar.setAttribute('aria-hidden','true');
      opt.append(avatar); copy.append(el('span','speaker',speaker));
    } else { const radio = el('span','radio'); radio.setAttribute('aria-hidden','true'); opt.append(radio); }
    copy.append(document.createTextNode(label));
    opt.append(copy);
    if (chosen === undefined) {
      opt.addEventListener('click',()=>{answers[index]=i; remember(); render(false,true);});
    } else {
      opt.disabled = true; opt.setAttribute('aria-pressed',String(i===chosen));
      if (i === q.correct || i === chosen) {
        opt.classList.add(i === q.correct ? 'good' : 'miss');
        const note = i === chosen ? (i === q.correct ? 'Твой ответ · верно' : 'Твой ответ') : 'Ключевая деталь';
        copy.append(el('span','option-status',note));
      }
    }
    group.append(opt);
  });
  scene.append(group);
  let resultTitle;
  if (chosen !== undefined) {
    const right = chosen === q.correct;
    const box = el('div','feedback'+(right ? '' : ' miss'));
    resultTitle = el('h3','',right ? q.success : q.retry);
    box.append(resultTitle,el('p','',q.answers[chosen][1]));
    const level = el('details','cooper');
    level.append(el('summary','','Режим внимания: '+q.mode.toLowerCase()),el('p','',q.modeText));
    box.append(level);
    scene.append(box,button(index === 1 ? 'Посмотреть следующий кадр' : index === questions.length-1 ? 'Посмотреть результат' : 'Следующая ситуация',()=>{index++; remember(); render(true);}));
    if (index === 0) scene.append(relatedStory());
  }
  layout.append(intro,scene); play.replaceChildren(layout);
  if (focusFeedback) focusAt(resultTitle);
  else if (moveFocus) { window.scrollTo(0,0); focusAt(h); }
}

render();
