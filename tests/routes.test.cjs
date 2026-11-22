const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync,existsSync} = require('node:fs');
const {join} = require('node:path');
const {build,catalog,ctx:context,modes,docs} = require('./game-helper.cjs');
const ids = ['dubl','locker','sticker','project','geopoint','team','dance','voice','money','stairs','rumour','invite'];
const stops = context.attentionStops;
for (const id of ids) for (const role of ['witness','self']) {
  test(id+' / '+role+' — both takes, all endings, visible signals and retry points',() => {
    const {story,cues,decisions} = build(id,role);
    // The same external event can follow different conscious readings of it.
    assert.notEqual(story.observe.mode,story.focus.mode);
    const dialogue = lines => lines.map(({parts,speaker,media})=>[speaker,parts?.text,media?.src]);
    if (id === 'dance') {
      // A gesture and a spoken request are observable even with the same later scene.
      assert.notDeepEqual(dialogue(story.observe.lines),dialogue(story.focus.lines));
    } else {
      assert.deepEqual(dialogue(story.observe.lines),dialogue(story.focus.lines));
    }
    for (const key of ['observe','focus']) {
      assert.equal(story[key+'-ease'].mode,'yellow');
      assert.equal(story[key+'-watch'].mode,'orange');
      const ease = dialogue(story[key+'-ease'].lines);
      const watch = dialogue(story[key+'-watch'].lines);
      if (id === 'money' || id === 'dance') {
        // After the shared signal, the player's next choice changes what happens.
        assert.notDeepEqual(ease,watch);
        assert.notEqual(story[key+'-ease'].outcome[1],story[key+'-watch'].outcome[1]);
      } else {
        assert.deepEqual(ease,watch);
      }
      assert.ok(decisions[key].signals.length);
    }
    const quiet = id === 'project' ? 'calm-act-0' : 'calm-end';
    assert.deepEqual(dialogue(story[quiet].lines),dialogue(story['calm-watch'].lines));
    assert.notEqual(story[quiet].mode,story['calm-watch'].mode);
    const seen = new Set();
    const endings = new Set();
    function walk(key, path) {
      assert.ok(!seen.has(key),'cycle or ambiguous parent: '+key);
      seen.add(key);
      const data = story[key];
      assert.ok(modes[data.mode] && data.lines.length,key);
      for (const {media} of data.lines) {
        if (typeof media === 'object') for (const path of [media.src,media.file,media.poster].filter(Boolean)) {
          assert.ok(existsSync(join(docs,path)),path);
        }
      }
      if (data.outcome) {
        endings.add(path[1]);
        assert.ok(data.note && data.outcome[1]);
        if (path[1] === 'pressure') {
          const review = stops(path,story,decisions);
          assert.ok(review.length);
          for (const stop of review) {
            assert.ok(story[stop.parent].links.length >= 1);
            for (const signal of stop.signals) {
              assert.ok(cues[signal],key+' / '+signal);
              const [phase] = signal.split('/');
              assert.ok(path.indexOf(phase) >= 0 && path.indexOf(phase) < path.indexOf(stop.id),signal);
              const line = story[phase].lines.find(line => line.ref === signal);
              assert.equal(line.parts.quote,cues[signal][0],signal);
            }
          }
        }
      } else {
        assert.ok(data.links.length && (key==='start' || data.question));
        for (const [target,label] of data.links) {
          assert.ok(label);
          assert.equal(story[target].parent,key);
          walk(target,[...path,target]);
        }
      }
    }
    walk('start',['start']);
    assert.deepEqual([...endings].sort(),['calm','pressure']);
    assert.equal(seen.size,Object.keys(story).length);
    if (role === 'witness' && id !== 'money') {
      assert.deepEqual(Array.from(stops(['start','pressure','ignore','stay'],story,decisions),s=>s.id),['ignore','stay']);
    }
  });
}

test('four paired pressure scenes, with an involuntary event only in first person',() => {
  const affected=[];
  for (const id of ids) {
    const own=build(id,'self'), witness=build(id,'witness');
    assert.ok(Object.values(witness.story).every(n=>!n.reaction && n.mode!=='black'));
    const nodes=Object.entries(own.story).filter(([,n])=>n.reaction);
    assert.ok(Object.values(own.story).every(n=>n.mode!=='black'));
    if (!nodes.length) continue;
    affected.push(id);
    assert.equal(nodes.length,1);
    const [key,n]=nodes[0];
    assert.equal(n.parent,'pressure');
    assert.equal(context.attentionAtLine(n,n.reaction.index-1),n.mode);
    assert.equal(context.attentionAtLine(n,n.reaction.index),'black');
    assert.equal(context.attentionAtLine(n,n.reaction.until-1),'black');
    assert.equal(context.attentionAtLine(n,n.lines.length-1),n.mode);
    assert.equal(n.links.length,2);
    for (const [next] of n.links) {
      const path=['start','pressure',key,next];
      assert.ok(stops(path,own.story,own.decisions).every(s=>!s.miss && s.answer!==n.reaction.summary));
    }
  }
  assert.deepEqual(affected.sort(),['money','stairs','team','voice']);
});

for (const id of ['speech','vision','abdomen','chest']) for (const role of ['witness','self']) {
  test(id+' / '+role+' — urgent call, review and recovery after waiting',() => {
    const {story,cues,decisions}=build(id,role);
    const visited=new Set();
    function visit(key,path) {
      assert.ok(!visited.has(key));
      visited.add(key);
      const node=story[key];
      for(const [next,label] of node.links || []) {
        assert.equal(story[next].parent,key);
        assert.ok(label);
        visit(next,[...path,next]);
      }
      if (!node.outcome || path.includes('calm')) return;
      assert.ok(path.some(k=>['call','delegate','call-now'].includes(k)));
      assert.match(node.note,/103 или 112/);
      for(const stop of stops(path,story,decisions)) for (const cue of stop.signals) {
        const [parent]=cue.split('/');
        assert.ok(path.indexOf(parent)<path.indexOf(stop.id));
        assert.equal(story[parent].lines.find(line=>line.ref===cue).parts.quote,cues[cue][0]);
      }
    }
    visit('start',['start']);
    assert.equal(visited.size,Object.keys(story).length);
    assert.ok(decisions.wait.miss && decisions.wait.repair==='call-now');
    assert.equal(story['call-now'].mode,'red');
  });
}
