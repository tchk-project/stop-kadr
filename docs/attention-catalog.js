'use strict';

const rehearsalOpening = [
  ['Вера','У кого видео с репетиции? Хочу посмотреть, как мы вышли.','Чат школьной группы'],
  ['Миша','Есть ещё дубль, где я начинаю припев на куплет раньше 😅',null,{'😂':['Даня','Саша']}],
  ['Костя','Ахаха. А в школьный чат этот скинем?'],
  ['Миша','Кость, этот в школьный не кидай. Сюда можно.']
];
const rehearsalPressure = {
  later:[['Костя','Давайте голосовать. Кто за то, чтобы в школьный кинуть?']],
  witness:{
    prompt:'Костя открыл голосование. Что ответишь?',
    actions:[
      ['Напомнить про другой дубль',[['Ты','Кость, Миша уже ответил. Вер, какой ещё дубль есть?'],['Миша','Последний можно.'],['Костя','Ок, беру последний.']],'Миша сам выбрал запись. Костя взял тот файл, на который он согласился.',null,'Костя выбрал другой дубль'],
      ['Спросить Мишу в личке',[['Ты','Миш, хочешь, я напишу в общий?','Личная переписка с Мишей'],['Миша','В общий пока не пиши. Просто посиди со мной.'],['Ты','Ага, я рядом.']],'Миша смог выбрать компанию. Что будет с голосованием, ещё неизвестно.',null,'Миша попросил Тимура побыть рядом']
    ],
    alternative:{position:1,label:'Проголосовать за смешной дубль',lines:[['Ты','Я за. Я там тоже не вовремя вступил.'],['Костя','Всё, кидаю.'],['Миша','В столовой теперь просят спеть «как на видео». Сегодня без меня.','На следующий день · личная переписка с Мишей']],headline:'Дубль попал в школьный чат',note:'Тимур смеялся и над собой. Костя посчитал его голос разрешением, хотя Миша просил оставить запись в группе.'}
  },
  self:{
    prompt:'Твою запись вынесли на голосование. Что тебе удобнее?',
    actions:[
      ['Написать админу группы',[['Ты','Вер, можешь снять опрос? Я не хочу этот дубль в школьный.','Личная переписка с Верой'],['Вера','Да, у меня есть права. Сейчас уберу.'],['Система','Вера закрыла опрос.','Чат школьной группы']],'Вера смогла закрыть опрос в вашей группе. Ты сам выбрал, к кому обратиться.',null,'Вера закрыла голосование'],
      ['Убрать звук и побыть с Верой',[['Ты','Вер, можно я к тебе? Не хочу сейчас это читать.','Личная переписка с Верой'],['Вера','Конечно. Я у кабинета музыки.'],['Ремарка','Ты выключаешь звук у чата и идёшь к Вере.']],'Миша взял паузу и договорился о встрече. Его просьба оставить запись в группе всё ещё в силе.',null,'Миша взял паузу и нашёл компанию']
    ],
    alternative:{position:2,kind:'open',label:'Дождаться, чем кончится опрос',lines:[['Ремарка','Ты убираешь телефон. Через полчаса на экране всё тот же опрос.'],['Вера','Миш, я у кабинета музыки. Хочешь, зайди.','Личная переписка с Верой']],headline:'Опрос ещё открыт, Вера на связи',note:'Ты уже сказал Косте, какой дубль можно выложить. Пока ты ждал, он оставил опрос открытым. Вера написала тебе отдельно.'}
  }
};

// Signals are excerpts from the transcript, including the visible text of live voice messages.
const focusSignals = {
  dubl:[['этот в школьный не кидай','Миша разрешил показать запись только внутри группы.'],['Давайте голосовать','Костя предложил решать за Мишу уже после его ответа.']],
  locker:[['Пройдёшь наш квест','Даня поставил условие, прежде чем вернуть чужую вещь.'],['Вчера тоже ждал','Миша говорит, что это повторилось.']],
  sticker:[['Я ему вчера написала, чтобы перестал','Лера уже просила об этом в личке. Сегодня тот же кот снова появился под голосовым.']],
  project:[['Верни имя','Тимур попросил указать его работу. На выступление он ещё не соглашался.'],['после защиты впишу','Класс увидит титульный раньше, чем в нём появится имя.']],
  geopoint:{
    witness:[['Не говори, где я','Аня прямо сказала Тимуру, какую информацию хочет оставить между ними.']],
    self:[['Ты же мне доверяешь','Лёша снова просит геопозицию после твоего отказа. Дружба не обязывает тебя включать передачу.'],['Не говори, где я','Ты прямо назвала Тимуру свою просьбу.']]
  },
  team:[['Тогда садишься отдельно','После отказа Костя поставил условие даже для места в автобусе.'],['Я вообще уже ехать не хочу','Тимур написал в личку, что теперь думает пропустить поездку.']],
  dance:{witness:[['Можно я с вами посижу','Даня не слышал разговора у стены. Сейчас Аня сама говорит, чего хочет.']],self:[['берёт тебя за запястье','Лёша удерживает тебя после отказа. Вера и дежурная рядом.']]},
  voice:[['хватит меня передразнивать','В голосовом слышна просьба Миши. Ребятам уже известно, хочет ли он продолжать эту шутку.']],
  money:[['Тогда с тебя двести','За отказ Даня повысил сумму и сказал, что будет ждать после уроков.']],
  stairs:[['дежурит Марина Сергеевна','Дежурная у соседней двери. Ей можно сказать, где нужна помощь.'],['Ещё шаг — ударю','Лёша преградил проход и прямо пригрозил ударить.']],
  rumour:{witness:[['тебе больше поверят','Костя хочет переслать обрезанный скрин от твоего имени.'],['Мне уже пишут гадости','Аня сама рассказала тебе, что получает сообщения.']],self:[['Он ведёт чат','Вера назвала человека, который может закрыть обсуждение под расписанием.']]},
  invite:[['Больше не добавляйте','Аня объяснила, что вышла сама.'],['Ань, нас пятеро','После её просьбы Костя снова добавил Аню ради команды.']]
};

const focusActionModes = {
  locker:['orange','orange'], sticker:['orange','orange'], project:['orange','orange'],
  geopoint:['orange','orange'], team:['orange','orange'], dance:{witness:['orange','orange'],self:['red','red']},
  voice:['orange','orange'], money:['red','red'], stairs:['red','red'], rumour:['orange','orange'],
  invite:['orange','orange'], dubl:['orange','orange']
};

function buildAttentionRoute(id, role) {
  if (healthScenes.some(scene => scene.id === id)) return buildHealthRoute(id,role);
  if (id === 'money' && role === 'witness') {
    const story = Object.fromEntries(Object.entries(attentionStory).map(([key,node]) =>
      [key,{...node,links:node.links?.map(link => [...link])}]));
    return addReadingChoices(id,role,{story,cues:{...attentionCues},decisions:{...attentionDecisions}});
  }
  const self = role === 'self';
  const select = value => value?.[role] ?? value;
  const episode = scenarios.find(scene => scene.id === id);
  const base = episode?.[role];
  const part = base?.otherContinuation || base || {...rehearsalPressure[role], later:rehearsalPressure.later};
  let opening = base?.opening || rehearsalOpening;
  let pressure = part.later;
  if (id === 'money') {
    opening = attentionStory.start.lines;
    pressure = attentionStory.pressure.lines.map(([speaker,words,context]) =>
      [speaker,words,speaker === 'Саша' ? 'Личная переписка с Мишей' : context]);
  }
  if (id === 'stairs' && self) pressure = part.later.map((line,i) =>
    i === 0 ? [line[0],line[1]+' Тимур остановился рядом у окна.',...line.slice(2)] : line);
  if (id === 'rumour' && self) {
    opening = [['Вера',{...screenshot,caption:'Ань, мне вот такой кусок прислали. Тут про нашу команду?'},'Личная переписка с Верой'],['Ты','Я впервые вижу этот скрин.']];
    pressure = [['Ты','Тим, мне уже пишут гадости. Ты знаешь, где это выложили?','Личная переписка с Тимуром'],...part.later];
  }
  const story = {}, cues = {}, decisions = {};
  story.start = {lines:opening,mode:'yellow',links:[['pressure','Читать дальше'],['calm','Спокойный дубль']]};
  story.pressure = {parent:'start',continuation:true,mode:'yellow',lines:pressure,question:part.prompt,links:[]};

  function signal(node, snippet, why) {
    const index = story[node].lines.findIndex(([,value]) => (typeof value === 'string' ? value : value.transcript || value.caption || '').toLowerCase().includes(snippet.toLowerCase()));
    if (index < 0) return null;
    const key = node+'-'+index;
    cues[key] = [snippet,why];
    return key;
  }
  const signals = select(focusSignals[id]).map(([snippet,why]) =>
    signal('pressure',snippet,why) || signal('start',snippet,why));
  function add(parent, key, label, data, decision) {
    story[parent].links.push([key,label]);
    story[key] = {parent,...data};
    if (decision) decisions[key] = decision;
  }
  function actions(parent, branch, modes) {
    branch.actions.forEach(([label,lines,note,,headline,kind = 'positive'],index) => {
      add(parent,parent+'-act-'+index,label,{mode:modes[index],lines,outcome:[kind,headline],note},
        parent === 'pressure' ? {signals,effect:note} : null);
    });
  }
  actions('pressure',part,select(focusActionModes[id]));
  const alt = part.alternative;
  const altLines = id === 'money' && self ? alt.lines.map((line,i) => i === 0 ? [...line.slice(0,2),'Чат секции'] : line) : alt.lines;
  // Some alternatives are ordinary readings of an ambiguous exchange, even
  // when the later outcome exposes a missed detail. Others notice the pressure.
  const downplayed = self ? ['dubl','locker','project'] : ['dubl','locker','project','team','dance','voice'];
  const altMode = downplayed.includes(id) ? 'yellow' : 'orange';
  const altNode = {mode:altMode,lines:altLines, outcome:[self ? alt.kind || 'mixed' : alt.kind || 'negative',alt.headline],note:alt.note};
  const altDecision = {signals,effect:alt.note,miss:!self};
  add('pressure','alternative',alt.label,altNode,altDecision);
  const links = story.pressure.links;
  links.splice(alt.position,0,links.pop());

  if (self) {
    const [quote,label,words,speaker,reply,headline] = selfFollowups[id];
    const effect = altNode.note;
    const [why,followup] = followupNotes[id];
    const cue = signal('alternative',quote,why);
    story.alternative = {parent:'pressure',mode:altMode,lines:altLines,question:'Что тебе сейчас подходит?',links:[]};
    const mode = ['money','dance'].includes(id) ? 'red' : 'orange';
    add('alternative','follow-up',label,{mode,lines:[[id==='geopoint'?'Ремарка':'Ты',words],[speaker,reply]],outcome:['positive',headline],note:followup},
      {signals:[cue],effect:followup});
    add('alternative','pause','Закончить этот дубль здесь',{mode:altMode,lines:[['Ремарка','На этом дубль заканчивается.']],outcome:altNode.outcome,note:effect},
      {signals:[cue],effect:'Можно взять паузу. Решать, возвращаться ли к этому разговору, по-прежнему тебе.'});
  } else {
    const p = witnessPauses[id];
    add('pressure','ignore',p.leave,{mode:'white',lines:[p.nudge],question:'Теперь ты знаешь ещё кое-что. Что сделаешь?',links:[]},
      {miss:true,signals,effect:'После твоего решения разговор продолжился: «'+p.nudge[1]+'»',repair:'rejoin',recovery:p.help[4]+'.'});
    const cue = signal('ignore',p.nudge[1],'Теперь к тебе обратились напрямую.');
    const [stayContext,helpContext] = witnessChannels[id] || [];
    const [stayEffect,helpEffect] = witnessEffects[id];
    const [label,who,words,headline] = p.stay;
    add('ignore','stay',label,{mode:'white',lines:[[who,words,stayContext]],outcome:['mixed',headline],note:stayEffect},
      {miss:true,signals:[cue],effect:stayEffect});
    const [help,answer,speaker,reply,result,kind = 'positive'] = p.help;
    add('ignore','rejoin',help,{mode:id==='stairs'?'red':'orange',lines:[['Ты',answer,helpContext],[speaker,reply]],outcome:[kind,result],note:helpEffect});
  }

  if (id === 'project') {
    story.calm = {parent:'start',continuation:true,mode:'yellow',lines:base.later,question:base.prompt,links:[]};
    actions('calm',base,['yellow','orange']);

  } else {
    const quiet = quietTakes[id];
    const [label,answer,who,reply,context] = quiet[role];
    story.calm = {parent:'start',continuation:true,mode:'yellow',lines:select(quiet.lines),question:'Как продолжишь?',links:[]};
    add('calm','calm-end','Посмотреть, что будет дальше',{mode:'yellow',lines:select(quiet.ordinary),outcome:['positive',quiet.result],note:quietNotes[id][0]});
    add('calm','ask',label,{mode:['dubl','rumour'].includes(id)?'orange':'yellow',lines:[['Ты',answer,context],[who,reply]],outcome:['positive',actionSummary(id,role)],note:id === 'dance' && !self ? 'Вера спросила про воду. Со своего места Даня видит, что Аня идёт с ней, а Лёша танцует у сцены.' : quietNotes[id][1]});
  }
  return addReadingChoices(id,role,{story,cues,decisions});
}
