const assert = require('node:assert/strict');
const test = require('node:test');
const {build,ctx,modes} = require('./game-helper.cjs');
const {story,cues,decisions} = build('money','witness');
const pick = ctx.pickAttentionTake;
const stops = path => ctx.attentionStops(path, story, decisions);
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
      assert.ok((id==='start' || page.question) && page.links.length,id);
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
    const [id,line] = key.split('/');
    const page = story[id];
    const speech = line === '@choice' ? story[page.parent].links.find(([target])=>target === id)[1] : page.lines.find(m=>m.ref===key).parts.text;
    assert.ok(speech.includes(snippet),key);
    assert.ok(explanation,key);
  }
});


function pathTo(id) { return story[id].parent ? [...pathTo(story[id].parent),id] : [id]; }

test('the initial draw gives the calm take exactly one tenth of the interval', () => {
  for (const [value,take] of [[0,'calm'],[.09999,'calm'],[.1,'pressure'],[.99999,'pressure']]) {
    assert.equal(pick(() => value),take);
  }
});

test('review follows only the player’s decisions, in order, and recognises repairs', () => {
  assert.deepEqual(Array.from(stops(pathTo('silence')),s => s.id),['ignore','silence']);
  assert.deepEqual(Array.from(stops(pathTo('meet')),s => s.id),['check','call','meet']);
  for (const [end,miss] of [['together','ignore'],['late-call','doubt']]) {
    const review = stops(pathTo(end));
    assert.equal(review.length,1);
    assert.equal(review[0].id,miss);
    assert.ok(review[0].recovery);
  }
  assert.equal(stops(pathTo('silence'))[0].recovery,'');
  assert.deepEqual(Array.from(stops(pathTo('pay')),s => s.id),['pay']);
});

test('each pressure outcome reviews signals the player could see before that decision', () => {
  for (const [end, data] of Object.entries(story)) {
    const path = pathTo(end);
    if (!data.outcome || !path.includes('pressure')) continue;
    const review = stops(path);
    assert.ok(review.length,end);
    for (const stop of review) {
      assert.equal(story[stop.id].parent,stop.parent);
      assert.ok(stop.answer && stop.effect);
      const known = path.slice(0,path.indexOf(stop.id));
      for (const key of stop.signals) {
        assert.ok(cues[key],key);
        assert.ok(known.includes(key.split('/')[0]),key);
      }
    }
  }
});
