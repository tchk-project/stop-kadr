const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync,existsSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

const docs = join(__dirname,'../docs');
const context = vm.createContext({});
for (const file of ['scenarios','attention','attention-takes','attention-paths','attention-readings','attention-catalog']) {
  vm.runInContext(readFileSync(join(docs,file+'.js'),'utf8'),context);
}
const {ids,build,stops,modes} = vm.runInContext(
  '({ids:["dubl",...scenarios.map(s=>s.id)],build:buildAttentionRoute,stops:attentionStops,modes:attentionModes})',context);

for (const id of ids) for (const role of ['witness','self']) {
  test(id+' / '+role+' — both takes, all endings, visible signals and retry points',() => {
    const {story,cues,decisions} = build(id,role);
    // The same external event can follow different conscious readings of it.
    assert.notEqual(story.observe.mode,story.focus.mode);
    assert.deepEqual(story.observe.lines,story.focus.lines);
    for (const key of ['observe','focus']) {
      assert.equal(story[key+'-ease'].mode,'yellow');
      assert.equal(story[key+'-watch'].mode,'orange');
      assert.deepEqual(story[key+'-ease'].lines,story[key+'-watch'].lines);
      assert.ok(decisions[key].signals.length);
    }
    const quiet = id === 'project' ? 'calm-act-0' : 'calm-end';
    assert.deepEqual(story[quiet].lines,story['calm-watch'].lines);
    assert.notEqual(story[quiet].mode,story['calm-watch'].mode);
    const seen = new Set();
    const endings = new Set();
    function walk(key, path) {
      assert.ok(!seen.has(key),'cycle or ambiguous parent: '+key);
      seen.add(key);
      const data = story[key];
      assert.ok(modes[data.mode] && data.lines.length,key);
      for (const [,media] of data.lines) {
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
              const cut = signal.lastIndexOf('-');
              const phase = signal.slice(0,cut);
              assert.ok(path.indexOf(phase) >= 0 && path.indexOf(phase) < path.indexOf(stop.id),signal);
              const words = story[phase].lines[Number(signal.slice(cut+1))][1];
              assert.ok((typeof words==='string'?words:words.transcript || words.caption).toLowerCase().includes(cues[signal][0].toLowerCase()),signal);
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
