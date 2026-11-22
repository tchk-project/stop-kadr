const {test} = require('node:test');
const assert = require('node:assert/strict');
const {build,catalog,read} = require('./game-helper.cjs');

for (const entry of catalog) {
  test(entry.id+' — both playable perspectives and complete media',() => {
    assert.notEqual(entry.roles.self.name,entry.roles.witness.name);
    assert.notEqual(entry.roles.self.intro,entry.roles.witness.intro);
    for (const [role,actor] of Object.entries(entry.roles)) {
      assert.ok(actor.intro.length>15 && actor.viewpoint);
      const route = build(entry.id,role);
      for (const scene of Object.values(route.story)) for (const line of scene.lines) {
        assert.ok(line.speaker);
        if (line.media?.kind === 'voice') assert.ok(line.media.transcript);
        if (line.media?.kind === 'image' || line.media?.kind === 'sticker') assert.ok(line.media.alt);
        for (const names of Object.values(line.reactions || {})) assert.ok(names.length);
      }
    }
  });
}

test('both perspectives share the presentation and voice recordings', () => {
  for (const id of ['project','voice']) {
    const media = role => ['start','pressure','calm'].flatMap(step=>build(id,role).story[step].lines.map(m=>m.media?.src).filter(Boolean));
    assert.deepEqual(new Set(media('self')),new Set(media('witness')));
  }
});

test('every medical story links to an on-site first-aid article with official sources', () => {
  for (const {id, article} of catalog.filter(s=>s.article)) {
    assert.match(article, /^\.\/[a-z-]+\.html$/, id);
    const html = read(article);
    for (const label of ['Какие признаки заметить', 'Что делать', 'Что сказать диспетчеру', 'Официальные источники']) {
      assert.ok(html.includes('<h2>' + label + '</h2>'), id + ': ' + label);
    }
    assert.ok(html.includes('103 или 112'), id);
    assert.ok((html.match(/href="https:\/\//g) || []).length >= 2, id);
  }
});
