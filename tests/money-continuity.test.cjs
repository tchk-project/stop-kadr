const {test} = require('node:test');
const assert = require('node:assert/strict');
const {build} = require('./game-helper.cjs');

const witness = build('money','witness');
const self = build('money','self');

function withAudience(story, path) {
  let channel;
  return path.flatMap(id => Array.from(story[id].lines, line => {
    channel = line.channel || channel;
    return {speaker:line.speaker, text:line.parts.text, channel};
  }));
}

test('both friends read the same threat and private request, then Sasha can wait for adults in class', () => {
  for (const {story} of [witness,self]) {
    const [threat,request] = story.pressure.lines;
    assert.equal(threat.channel.kind,'group');
    assert.equal(request.channel.kind,'private');
    assert.match(threat.parts.text,/после уроков/i);
    assert.doesNotMatch(threat.parts.text,/раздевалк|у выхода/i);
    assert.match(request.parts.text,/вчера.*у раздевалки/);
  }
  assert.deepEqual(
    Array.from(witness.story.pressure.lines,row => row.parts.text),
    Array.from(self.story.pressure.lines,row => row.parts.text)
  );
  const choice = self.story.pressure.links.find(([id]) => id === 'meet-at-door');
  assert.match(choice[1],/в классе с учительницей.*Мишу.*с тренером/iu);
  const [request,confirmation,arrive,threat] = self.story['meet-at-door'].lines;
  assert.equal(request.channel.kind,'private');
  assert.match(request.parts.text,/останусь в классе с Мариной Сергеевной/);
  assert.match(confirmation.parts.text,/вместе к вам в класс/);
  assert.equal(arrive.speaker,'Ремарка');
  assert.match(arrive.parts.text,/Марина Сергеевна.*в классе.*приходят Миша и тренер/);
  assert.equal(threat.speaker,'Даня');
  assert.doesNotMatch(self.story['follow-up'].note,/назвал место|у раздевалки/);
});

test('meeting details stay out of group chat and each friend hears from their own contact', () => {
  for (const parent of ['observe','focus']) {
    const prefix = ['start','pressure',parent];
    const own = withAudience(self.story,prefix);
    const coach = own.findIndex(row=>row.speaker==='Тренер');
    assert.ok(coach>=0);
    assert.match(own[coach].text,/у твоего кабинета/);
    for (const row of own.slice(coach)) {
      assert.equal(row.channel.kind,'private');
      assert.match(row.channel.title,/тренером/);
    }
    assert.equal(coach,own.length-1, 'Sasha has not accepted either plan before his choice');
    assert.match(own[coach].text,/вместе выйдем.*подождать/);
    assert.match(self.story[parent].links.find(([id])=>id===parent+'-ease')[1],/Выйду с тренером/);
    assert.match(self.story[parent].links.find(([id])=>id===parent+'-watch')[1],/побыть со мной в классе.*Миша/);
    const received = withAudience(witness.story,prefix);
    assert.ok(received.every(row=>row.speaker!=='Тренер'));
    const update = received.at(-1);
    assert.equal(update.speaker,'Саша');
    assert.equal(update.channel.kind,'private');
    assert.match(update.channel.title,/Сашей/);
    assert.match(update.text,/тренер.*подошёл/i);
    for (const {story} of [self,witness]) {
      for (const suffix of ['-ease','-watch']) {
        const path = [...prefix,parent+suffix];
        for (const row of withAudience(story,path).filter(r=>r.channel.kind==='group')) {
          assert.doesNotMatch(row.text,/крыльц|кабинет|раздевалк|жду у|вижу вас|у двер/iu);
        }
      }
    }
    const waited = witness.story[parent+'-ease'];
    assert.ok(waited.lines.every(row => row.speaker !== 'Ты'));
    assert.match(waited.lines.at(-1).parts.text,/с тренером вышел/);
    const answered = witness.story[parent+'-watch'];
    assert.equal(answered.lines[0].channel.kind,'private');
    assert.deepEqual(Array.from(answered.lines,row => row.speaker),['Ты','Саша','Ремарка']);
    assert.match(answered.lines.at(-1).parts.text,/Саша выходит с тренером/);
    const ownWalk = self.story[parent+'-ease'];
    assert.deepEqual(Array.from(ownWalk.lines,row=>row.speaker),['Ты','Ремарка']);
    assert.equal(ownWalk.lines[0].channel.kind,'private');
    assert.match(ownWalk.lines[0].parts.text,/пойдёмте вместе/);
    assert.match(ownWalk.lines.at(-1).parts.text,/крыльц/);
    const waiting = withAudience(self.story,[...prefix,parent+'-watch']).slice(own.length);
    assert.deepEqual(waiting.map(row=>row.speaker),['Ты','Тренер','Ты','Миша','Ремарка']);
    assert.match(waiting[0].text,/Мишу хочу дождаться/);
    assert.match(waiting[1].text,/я с тобой/);
    assert.deepEqual(waiting.slice(0,4).map(row=>row.channel.kind),Array(4).fill('private'));
    assert.match(waiting[0].channel.title,/тренером/);
    assert.match(waiting[2].channel.title,/Мишей/);
    assert.equal(waiting[4].channel.kind,'scene');
    assert.match(waiting[4].text,/Тренер садится рядом с тобой.*Миша заглядывает в дверь/);
  }
});

test('the person at the door can choose either gesture and can read the calm chat in silence', () => {
  const atDoor = self.story['meet-at-door'];
  assert.ok(atDoor.reaction);
  for (const [id,label] of atDoor.links) {
    assert.match(label,/Кивну|Покажу/);
    assert.ok(self.story[id].lines.every(row => row.speaker === 'Ремарка'));
  }
  assert.equal(witness.story['meet-at-door'].reaction,undefined);
  for (const ending of ['calm-end','calm-watch']) {
    assert.ok(self.story[ending].lines.every(row => !['Ты','Саша'].includes(row.speaker)));
  }
  assert.equal(self.story.ask.lines[0].speaker,'Ты');
});
