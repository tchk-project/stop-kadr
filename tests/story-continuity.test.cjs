const test = require('node:test');
const assert = require('node:assert/strict');
const {build,catalog} = require('./game-helper.cjs');

test('Anya sends Timur the same private question in both perspectives', () => {
  const timur = build('rumour', 'witness').story;
  const anya = build('rumour', 'self').story;
  const incoming = timur.pressure.lines.find(line => line.speaker === 'Аня');
  const outgoing = anya.pressure.lines.find(line => line.speaker === 'Ты');
  assert.equal(incoming.channel.kind, 'private');
  assert.equal(outgoing.channel.kind, 'private');
  assert.equal(outgoing.parts.text, incoming.parts.text);
});

test('the coach is the first person to locate the discussion on Timur’s route', () => {
  const {story} = build('rumour', 'witness');
  const conversation = [
    ...story.start.lines,
    ...story.pressure.lines,
    ...story['pressure-act-1'].lines,
  ];
  const firstMention = conversation.find(line => /под расписанием/i.test(line.parts?.text));
  assert.equal(firstMention?.speaker, 'Тренер');
});

test('leaving the team poll switches to Vera’s private chat before either girl writes', () => {
  const {story} = build('rumour', 'self');
  const poll = story.alternative.lines[0].channel;
  assert.equal(poll.kind, 'group');
  let channel = poll;
  for (const line of story['follow-up'].lines) {
    channel = line.channel || channel;
    assert.equal(channel.kind, 'private');
    assert.match(channel.title, /Верой/);
  }
});

test('the approved rehearsal clip is published in a different group from the rehearsal discussion', () => {
  for (const role of ['self', 'witness']) {
    const {story} = build('dubl', role);
    const band = story.start.lines[0].channel;
    for (const ending of ['calm-end', 'calm-watch']) {
      const clip = story[ending].lines.find(line => line.media?.kind === 'video');
      assert.equal(clip.channel?.kind, 'group');
      assert.notEqual(clip.channel.title, band.title);
    }
  }
});

test('at the dance a private answer, making room, and a visible invitation reach Anya differently', () => {
  const {story} = build('dance','witness');
  const reply = story['pressure-act-0'].lines[0];
  assert.equal(reply.speaker,'Ты');
  assert.equal(reply.channel.kind,'private');
  for (const id of ['observe','focus']) {
    assert.equal(story[id].lines[0].channel.kind,'scene');
    assert.equal(story[id].lines[0].speaker,'Ремарка');
    assert.equal(story[id].lines.at(-1).speaker,'Аня');
    const directQuestion = story[id+'-watch'].lines;
    assert.deepEqual(Array.from(directQuestion, line => line.speaker),['Ты','Аня']);
    assert.ok(story[id+'-ease'].lines.every(line => line.speaker === 'Ремарка'));
  }
  assert.notEqual(story.focus.lines[0].id,story.observe.lines[0].id);
});

test('Anya can summon Vera with a gesture and ask her to stay after the hand is released', () => {
  const {story} = build('dance','self');
  assert.equal(story.observe.lines[0].speaker,'Ты');
  assert.equal(story.focus.lines[0].speaker,'Ремарка');
  for (const id of ['observe','focus']) {
    assert.ok(story[id].lines.some(line => line.parts?.quote?.includes('отпускает')));
    assert.deepEqual(Array.from(story[id+'-watch'].lines, line => line.speaker),['Ты','Вера']);
    assert.equal(story[id+'-watch'].outcome[0],story[id+'-ease'].outcome[0]);
  }
});

test('the girls discuss the sticker in private, with the partner named by the choice', () => {
  for (const [role, partner] of [['witness','Лерой'], ['self','Даней']]) {
    const {story} = build('sticker',role);
    for (const start of ['focus','observe']) {
      const [question, answer] = story[start+'-watch'].lines;
      assert.equal(question.speaker,'Ты');
      assert.equal(question.channel.kind,'private');
      assert.ok(question.channel.title.endsWith(partner));
      assert.ok(answer.parts.text);
      assert.notEqual(answer.speaker,'Ты');
    }
  }
});

test('checking a clip shows the published video after consent, in the school chat', () => {
  for (const role of ['witness','self']) {
    const {story} = build('dubl',role);
    for (const start of ['focus','observe']) {
      const lines = story[start+'-watch'].lines;
      const clip = lines.at(-1);
      assert.equal(clip.media.kind,'video');
      assert.equal(clip.channel.title,'Общешкольный чат');
      assert.match(lines.at(-2).parts.text,/можно/);
    }
  }
});

test('a request for someone else to make the call is followed by that person speaking', () => {
  for (const [id,role,step,person] of [
    ['speech','witness','delegate','Саша'], ['vision','witness','delegate','Вера'],
    ['vision','self','delegate','Тимур'], ['abdomen','self','call','Тимур'],
    ['chest','self','call','Лера'],
  ]) {
    const {story} = build(id,role);
    const lines = story[step].lines;
    assert.equal(lines[0].speaker,'Ты');
    assert.ok(lines.slice(1).some(line=>line.speaker===person));
  }
});

test('the class chat and an unanswered call can both lead to visible help from inside the classroom', () => {
  const {story,decisions} = build('stairs','witness');
  for (const [first, next, adult] of [
    ['alternative','call-after-chat','Марина Сергеевна'],
    ['stay','tell-teacher','Учитель географии'],
  ]) {
    assert.equal(story[next].parent,first);
    assert.equal(decisions[first].repair,next);
    assert.ok(decisions[first].miss);
    assert.equal(story[first].outcome,undefined);
    assert.match(story[first].question,/класс/);
    const lines = story[next].lines;
    assert.equal(lines[0].speaker,'Ты');
    assert.match(lines[0].parts.text,/лестниц/);
    assert.equal(lines[1].speaker,adult);
    assert.equal(lines.at(-1).speaker,'Ремарка');
    assert.match(lines.at(-1).parts.text,/Лёша (отходит|отступил)/);
  }
  assert.match(story.stay.lines.at(-1).parts.text,/ответа дежурной не слышно/);
});

test('after joining the joke Sasha can apologise personally and Misha decides whether to play', () => {
  const {story,decisions} = build('voice','witness');
  assert.equal(story.alternative.lines.at(-1).speaker,'Миша');
  assert.ok(story.alternative.lines.some(l=>l.speaker==='Система' && /покинул/.test(l.parts.text)));
  assert.equal(decisions.alternative.repair,'apologise');
  const [apology, reply] = story.apologise.lines;
  assert.equal(apology.channel.kind,'private');
  assert.match(apology.channel.title,/Мишей/);
  assert.match(apology.parts.text,/Прости.*Зря я/);
  assert.equal(reply.speaker,'Миша');
  assert.match(reply.parts.text,/позже.*не хочу/i);
  assert.equal(story.apologise.outcome[0],'open');
  assert.equal(story['leave-message'].parent,'alternative');
});

test('a personal pause is visibly permitted and the card describes what the child actually knows', () => {
  for (const id of ['dubl','locker','sticker','project','geopoint','team','dance','voice','money','stairs','rumour','invite']) {
    const {story,decisions} = build(id,'self');
    const button = story.alternative.links.find(([target])=>target==='pause');
    assert.ok(button, id);
    assert.doesNotMatch(button[1],/закончить этот дубль/i,id);
    assert.equal(story.pause.outcome[0],id==='stairs'?'positive':'open',id);
    assert.match(story.pause.note,/можно/i,id);
    assert.doesNotMatch(story.pause.lines.at(-1).parts.text,/дубль заканчивается/i,id);
    assert.ok(!decisions.pause.miss,id);
  }
  const stairs=build('stairs','self').story.pause;
  assert.match(stairs.note,/побыть с Тимуром.*освободила проход/);
});

test('the project distinguishes the class screen, a teacher conversation and a later submission', () => {
  const {story} = build('project','self');
  assert.match(story['pressure-act-0'].note,/экране класса пока заставка.*присланном файле/i);
  assert.match(story['pressure-act-1'].note,/увидела учительница.*класс ещё не слышал/i);
  assert.match(story.pause.note,/файл для сдачи.*Классу.*только Мишу и Аню/i);
});

test('the band checks the chat during a rehearsal break and the rehearsal ends on the wait route', () => {
  const band = catalog.find(s=>s.id==='dubl');
  for (const role of ['self','witness']) assert.match(band.roles[role].intro,/перерыв/i);
  assert.match(build('dubl','self').story.alternative.lines[0].parts.text,/репетиция заканчивается/);
});

test('Timur knows the bus stop from Anya and neither friend treats a bus text as a witnessed departure', () => {
  const timur=build('geopoint','witness').story;
  const stop=timur.start.lines.find(l=>l.speaker==='Аня');
  assert.match(stop.parts.text,/на остановке/);
  const observe=timur.pressure.links.find(([target])=>target==='observe')[1];
  assert.match(observe,/Лёше про остановку/);
  assert.doesNotMatch(observe,/точк|геометк/i);
  for (const role of ['self','witness']) {
    const {story}=build('geopoint',role);
    for (const id of ['observe','focus']) {
      assert.ok(story[id].lines.some(l=>l.speaker==='Лёша' && /сел в автобус/.test(l.parts.text)));
      for (const [, label] of story[id].links) assert.doesNotMatch(label,/Лёша уехал[.!]/);
    }
  }
});

test('the calm screenshot endings only describe the contact each person heard from', () => {
  for (const [role,person] of [['self','Вера'],['witness','Костя']]) {
    const {story}=build('rumour',role);
    for (const id of ['calm-end','calm-watch']) {
      assert.doesNotMatch(story[id].outcome[1],/Скрин дальше не переслали/i);
      const sceneLines = [...story.calm.lines,...story[id].lines];
      assert.ok(sceneLines.some(l=>l.speaker===person && /кидать|скинул|не кину/i.test(l.parts.text)));
      assert.match(story[id].note,role==='self'?/Вера/:/Кост/);
    }
  }
});

test('Lera only witnesses Anya leave the chat and say good night privately', () => {
  const {story}=build('invite','witness');
  for (const id of ['observe','focus']) {
    const end=story[id+'-watch'];
    assert.equal(end.lines[0].speaker,'Система');
    assert.match(end.lines[0].parts.text,/вышла из беседы/);
    const personal = end.lines.find(l=>l.speaker==='Ты');
    assert.equal(personal.channel.kind,'private');
    assert.match(personal.channel.title,/Аней/);
    assert.match(end.note,/вышла из беседы/i);
    assert.doesNotMatch(end.note,/вышла из игры/);
  }
});

test('help during the restraint or threat has one level until release or reaching the classroom', () => {
  for (const [id,role] of [['dance','self'],['stairs','self'],['stairs','witness']]) {
    const {story, decisions, cues} = build(id,role);
    for (const first of ['observe','focus']) {
      assert.equal(story[first].mode,'red');
      assert.ok(decisions[first].signals.some(ref =>
        /запястье|ударю/.test(cues[ref][0])));
      for (const [safe] of story[first].links) {
        assert.ok(['orange','yellow'].includes(story[safe].mode));
        assert.ok(decisions[safe].signals.some(ref =>
          /отпускает|встаёт в дверях/.test(cues[ref][0])));
      }
    }
  }
  const dance = build('dance','self').story;
  assert.ok(dance.alternative.lines.some(line => /отпускает твою руку/.test(line.parts.text)));
  assert.equal(dance['follow-up'].mode,'orange');
});

test('Misha sees the same independent poll closure during the break or after rehearsal', () => {
  const {story,decisions} = build('dubl','self');
  const common = Array.from(story.observe.lines, row=>row.id);
  assert.deepEqual(Array.from(story.alternative.lines.slice(1,-1), row=>row.id),common);
  assert.deepEqual(Array.from(story.observe.lines,row=>row.speaker),['Вера','Костя','Система']);
  assert.match(story.observe.lines[0].parts.text,/Миша.*первый дубль только для нас/);
  assert.match(story.observe.lines.at(-1).parts.text,/Костя закрыл опрос/);
  assert.match(story.alternative.lines[0].parts.text,/Через полчаса репетиция заканчивается/);
  assert.match(decisions.observe.effect,/сразу, в перерыве/);
  assert.match(story.pause.outcome[1],/Опрос закрыт/);
  assert.ok(story['follow-up'].lines.every(line => !/закры(вай|ть|л).*опрос/.test(line.parts.text)));
});

test('Anya can review the missing context and abuse before asking for votes', () => {
  const {story,cues,decisions} = build('rumour','self');
  const poll = decisions.alternative.signals;
  assert.deepEqual(Array.from(poll,ref=>cues[ref][0]),['одну фразу без соседних сообщений','мне уже пишут гадости']);
  assert.ok(story.start.lines.some(row => row.ref === poll[0] && row.media?.kind === 'image'));
  assert.ok(story.pressure.lines.some(row => row.ref === poll[1] && row.speaker === 'Ты'));
  const coachRoutes = Object.entries(decisions)
    .filter(([,choice]) => choice.signals.some(ref => cues[ref][0] === 'Он ведёт чат'))
    .map(([step]) => step);
  assert.deepEqual(coachRoutes.sort(),['pressure-act-0','pressure-act-1']);
});

test('Misha can play from the gym or explain why he missed the warm-up', () => {
  const {story} = build('locker','self');
  assert.match(story.alternative.lines.at(-1).parts.text,/заходишь в зал.*разминка уже закончилась/);
  const pause = story.alternative.links.find(([id])=>id==='pause')[1];
  assert.match(pause,/Присоединюсь к игре.*если захочу/);
  assert.doesNotMatch(pause,/переоденусь/);
  assert.match(story.pause.lines.at(-1).parts.text,/пас.*игру/);
  assert.equal(story['follow-up'].lines[0].speaker,'Ты');
  assert.match(story['follow-up'].lines[0].parts.text,/Даня взял рюкзак/);
});
