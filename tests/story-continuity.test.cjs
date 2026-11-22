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
