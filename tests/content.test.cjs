const assert = require('node:assert/strict');
const {existsSync, readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const docs = path.join(__dirname, '../docs');
const read = name => readFileSync(path.join(docs, name), 'utf8');
const context = vm.createContext({
  document: {querySelector: () => ({dataset:{role:'witness'}, getAttribute:()=>'./index.html'})},
  location: {search:'', hash:''}, URLSearchParams
});
vm.runInContext([read('scenarios.js'), read('catalog.js'), read('detail-cues.js')].join('\n'), context);
const {scenarios, rehearsal, avatarSlots, sceneDetails} = vm.runInContext(
  '({scenarios, rehearsal, avatarSlots, sceneDetails})', context
);

test('every fixed character has a distinct portrait, including both players in each scene', () => {
  const slots = Object.values(avatarSlots);
  assert.equal(new Set(slots).size, slots.length);
  for (const scene of [rehearsal, ...scenarios]) {
    assert.notEqual(scene.actors.witness, scene.actors.self, scene.id);
    for (const name of Object.values(scene.actors)) assert.ok(name in avatarSlots, name);
  }
});

for (const scene of scenarios) for (const role of ['witness','self']) {
  test(scene.id+' / '+role+' — speakers, media and review stops', () => {
    const story = scene[role];
    const rows = new Map();
    function add(step, lines) {
      lines.forEach((line,i) => {
        rows.set(step+'-'+i,line);
        const [speaker, words,, reactions] = line;
        const author = speaker.split(' · ')[0];
        assert.ok(['Система','Ремарка','Ты'].includes(author) || author in avatarSlots, author);
        assert.notEqual(author,scene.actors[role], 'Incoming bubble speaks as the player');
        for (const reactors of Object.values(reactions || {})) {
          for (const reactor of reactors) assert.ok(reactor in avatarSlots,reactor);
        }
        if (typeof words !== 'string') {
          for (const file of [words.src, words.file].filter(Boolean)) {
            assert.ok(existsSync(path.join(docs, file)), file);
          }
        }
      });
    }
    add('start',story.opening);
    for (const [branch,prefix] of [[story,''],[story.otherContinuation,'other-']]) {
      if (!branch) continue;
      add(prefix+'later',branch.later);
      add(prefix+'consequence',branch.alternative.lines);
      branch.actions.forEach((action,i) => {
        const words=action[1];
        add(prefix+'act-'+i,Array.isArray(words) ? words : [['Ты',words]]);
      });
    }
    for (const [key,[focus]] of Object.entries(sceneDetails[scene.id][role])) {
      assert.ok(rows.has(key),key);
      const [,words,,reactions] = rows.get(key);
      if (focus === '@reactions') assert.ok(reactions && Object.keys(reactions).length > 0,key);
      else if (focus.startsWith('@')) {
        const kind = focus === '@transcript' ? 'voice' : focus.slice(1);
        assert.equal(words.kind,kind,key);
      } else {
        const text=typeof words === 'string' ? words : words.transcript || words.caption;
        assert.ok(text.toLowerCase().includes(focus.toLowerCase()),key+' / '+focus);
      }
    }
  });
}

test('both players see the same files and hear the same voices in the shared scenes', () => {
  const project=scenarios.find(scene=>scene.id==='project');
  const voice=scenarios.find(scene=>scene.id==='voice');
  for (const scene of [project,voice]) {
    for (const phase of ['opening','later']) {
      assert.deepEqual(scene.self[phase].map(m=>m[1]),scene.witness[phase].map(m=>m[1]));
    }
  }
  assert.deepEqual(project.self.otherContinuation.later.map(m=>m[1]),project.witness.otherContinuation.later.map(m=>m[1]));
});

test('every medical story links to an on-site first-aid article with official sources', () => {
  for (const {id, article} of vm.runInContext('healthScenes', context)) {
    assert.match(article, /^\.\/[a-z-]+\.html$/, id);
    const html = read(article);
    for (const label of ['Какие признаки заметить', 'Что делать', 'Что сказать диспетчеру', 'Официальные источники']) {
      assert.ok(html.includes('<h2>' + label + '</h2>'), id + ': ' + label);
    }
    assert.ok(html.includes('103 или 112'), id);
    assert.ok((html.match(/href="https:\/\//g) || []).length >= 2, id);
  }
});
