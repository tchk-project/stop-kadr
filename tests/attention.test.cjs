const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = readFileSync(join(__dirname, '../docs/attention.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const {story,modes,cues} = vm.runInContext('({story:attentionStory,modes:attentionModes,cues:attentionCues})',ctx);

test('every choice has one replayable path, a mode and a consequence or next decision', () => {
  const seen = new Set();
  function visit(id, parent) {
    assert.ok(!seen.has(id), id);
    seen.add(id);
    const page = story[id];
    assert.equal(page.parent,parent,id);
    assert.ok(modes[page.mode],id);
    assert.ok(page.lines.length,id);
    if (page.outcome) {
      assert.ok(page.note && page.outcome[1],id);
    } else {
      assert.ok(page.question && page.links.length,id);
      for (const [target,label] of page.links) { assert.ok(label); visit(target,id); }
    }
  }
  visit('start');
  assert.equal(seen.size,Object.keys(story).length);
});

test('white is a decision to ignore an observed signal and can be reversed', () => {
  assert.equal(story.start.mode,'yellow');
  assert.equal(story.calm.mode,'yellow');
  assert.equal(story['calm-end'].mode,'yellow');
  assert.equal(story.ignore.mode,'white');
  assert.equal(story.doubt.mode,'white');
  assert.equal(story['back-in'].mode,'orange');
  assert.equal(story['late-call'].mode,'red');
  assert.equal(story['send-vera'].mode,'red');
  assert.equal(story['send-vera'].outcome[0],'positive');
  assert.equal(story.pay.mode,'orange');
  assert.equal(story.pay.outcome[0],'mixed');
});

test('every replay stop highlights words visible on its own branch', () => {
  for (const [key,[snippet, explanation]] of Object.entries(cues)) {
    const [,id,line] = /^(.*)-(choice|\d+)$/.exec(key);
    const page = story[id];
    const speech = line === 'choice' ? story[page.parent].links.find(([target])=>target === id)[1] : page.lines[Number(line)][1];
    assert.ok(speech.toLowerCase().includes(snippet.toLowerCase()),key);
    assert.ok(explanation,key);
  }
});
