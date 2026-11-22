const test = require('node:test');
const assert = require('node:assert/strict');
const {build} = require('./game-helper.cjs');

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
