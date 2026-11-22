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

test('stroke reviews explain the consequence separately from the signs', () => {
  for (const id of ['speech', 'vision']) for (const role of ['witness', 'self']) {
    const {cues, decisions} = build(id, role);
    for (const [step, {effect}] of Object.entries(decisions)) {
      for (const [, explanation] of Object.values(cues)) {
        assert.ok(!effect.includes(explanation), [id, role, step].join('/'));
      }
    }
  }
});

test('Vera gives Timur as the source of the time and describes what she saw', () => {
  const {story} = build('vision', 'witness');
  const [timur, vera] = story['delegate-time'].lines;
  assert.equal(timur.speaker, 'Ты');
  assert.match(timur.parts.text, /12:25/);
  assert.equal(vera.speaker, 'Вера');
  assert.match(vera.parts.text, /Тимур.*12:25/);
  assert.match(vera.parts.text, /видела.*пошатнулась/);
});

test('every medical story links to an on-site first-aid article with official sources', () => {
  const clinicalSources = {
    './stroke.html':['congress-med.ru','www.nhs.uk'],
    './heart-attack.html':['www.who.int','firstaidchampions.redcross.org.uk'],
    './abdominal-pain.html':['www.nhs.uk']
  };
  for (const {id, article} of catalog.filter(s=>s.article)) {
    assert.match(article, /^\.\/[a-z-]+\.html$/, id);
    const html = read(article);
    for (const label of ['Какие признаки заметить', 'Что делать', 'Что сказать диспетчеру', 'Источники памятки']) {
      assert.ok(html.includes('<h2>' + label + '</h2>'), id + ': ' + label);
    }
    assert.ok(html.includes('103 или 112'), id);
    const urls = [...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map(match => new URL(match[1]));
    if (article === './abdominal-pain.html') {
      assert.ok(urls.every(url => !url.href.includes('nikid.ru/kak-raspoznat-appendicit-u-rebenka-i')));
    }
    assert.ok(new Set(urls.map(url => url.host)).size >= 2, id);
    for (const host of ['mo03.ru', ...(clinicalSources[article] || [])]) {
      assert.ok(urls.some(url => url.host === host), id + ': ' + host);
    }
    assert.match(html, /<time datetime="\d{4}-\d{2}-\d{2}">/);
  }
});
