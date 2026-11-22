const {test} = require('node:test');
const assert = require('node:assert/strict');
const {build} = require('./game-helper.cjs');

const witness = build('money','witness');
const self = build('money','self');

test('both friends read the same threat and request, with separate audiences', () => {
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
  assert.match(choice[1],/вчера.*Миш/iu);
  const [requestToMeet] = self.story['meet-at-door'].lines;
  assert.equal(requestToMeet.channel.kind,'private');
  assert.match(requestToMeet.parts.text,/встреть меня у раздевалки/);
  assert.doesNotMatch(self.story['follow-up'].note,/назвал место|у раздевалки/);
});

test('the coach can act independently, and Misha can still answer the private request', () => {
  for (const parent of ['observe','focus']) {
    const initial = witness.story[parent];
    assert.equal(initial.lines[0].speaker,'Тренер');
    assert.equal(initial.lines[0].channel.kind,'group');
    assert.equal(initial.lines[1].speaker,'Саша');

    const waited = witness.story[parent+'-ease'];
    assert.ok(waited.lines.every(row => row.speaker !== 'Ты'));
    assert.match(waited.lines.at(-1).parts.text,/с тренером вышел/);

    const answered = witness.story[parent+'-watch'];
    assert.equal(answered.lines[0].channel.kind,'private');
    assert.deepEqual(Array.from(answered.lines,row => row.speaker),['Ты','Саша','Ремарка']);
    assert.match(answered.lines.at(-1).parts.text,/Саша выходит с тренером и подходит к тебе/);

    const ownWalk = self.story[parent+'-ease'];
    assert.ok(ownWalk.lines.every(row => row.speaker === 'Ремарка'));
    const ownRequest = self.story[parent+'-watch'];
    assert.equal(ownRequest.lines[0].channel.kind,'private');
    assert.deepEqual(Array.from(ownRequest.lines,row => row.speaker),['Ты','Миша','Ремарка']);
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
