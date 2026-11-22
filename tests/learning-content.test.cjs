const test = require('node:test');
const assert = require('node:assert/strict');
const {build, catalog} = require('./game-helper.cjs');

test('putting the phone away has a different consequence once the collection is settled', () => {
  for (const role of ['self', 'witness']) {
    const {story, decisions} = build('money', role);
    const resting = story.calm.links.find(([id]) => story[id].mode === 'white');
    assert.ok(resting);
    const [id] = resting;
    assert.match(resting[1], /на тренировку/);
    assert.equal(story[id].outcome[0], 'positive');
    assert.ok(!decisions[id]?.miss);
    assert.ok(story[id].lines.some(line => /сумку на тренировку/.test(line.parts.text)));
  }
  const {story, decisions} = build('money', 'witness');
  assert.equal(story.ignore.mode, 'white');
  assert.ok(decisions.ignore.miss);
  assert.ok(story.ignore.links.some(([id]) => id === decisions.ignore.repair));
});

test('a clue explanation and the consequence of a later choice describe different moments', () => {
  for (const {id} of catalog) {
    for (const role of ['self', 'witness']) {
      const {cues, decisions} = build(id, role);
      for (const [step, decision] of Object.entries(decisions)) {
        for (const cue of decision.signals) {
          assert.notEqual(cues[cue][1].trim(), decision.effect.trim(), id+' / '+role+' / '+step);
        }
      }
    }
  }
});

test('Timur can enjoy his playlist, and Anya can put her phone away after her refusal is accepted', () => {
  for (const [id, label, event] of [
    ['team', /плейлист/, /надеваешь наушники/],
    ['geopoint', /Уберу телефон/, /убираешь телефон в карман/],
  ]) {
    const {story} = build(id, 'self');
    const [target] = story.calm.links.find(([, text]) => label.test(text));
    assert.equal(story[target].mode, 'white');
    assert.ok(story[target].lines.some(line => event.test(line.parts.text)));
  }
});

test('Anya already knows Timur will keep her stop private on the route where he answered her', () => {
  const {story} = build('geopoint', 'witness');
  const focused = story['focus-watch'].lines;
  const observed = story['observe-watch'].lines;
  assert.equal(focused[0].channel.kind, 'private');
  assert.match(focused[0].parts.text, /написал.*автобус/);
  assert.doesNotMatch(focused.at(-1).parts.text, /гадала/);
  assert.match(observed.at(-1).parts.text, /гадала/);
});
