const test = require('node:test');
const assert = require('node:assert/strict');
const {build,ctx,catalog} = require('./game-helper.cjs');

test('retry replaces the abandoned decisions, and bookmarks restore their own branch', () => {
  const {story,decisions} = build('money','witness');
  const missed = ctx.routePath(story,'silence');
  const retry = ctx.travelPath(story,missed,'pressure');
  const next = ctx.travelPath(story,retry,'check');
  assert.deepEqual(Array.from(next),['start','pressure','check']);
  assert.deepEqual(Array.from(ctx.attentionStops(next,story,decisions),d=>d.id),['check']);
  assert.deepEqual(Array.from(ctx.routePath(story,'silence',next)),Array.from(missed));
  assert.deepEqual(Array.from(ctx.routePath(story,'check',['start','calm','check'])),Array.from(next));
});

test('every catalog entry opens in both roles and all links lead to reachable scenes', () => {
  for (const {id} of catalog) for (const role of ['witness','self']) {
    const {story} = build(id,role);
    for (const [step,node] of Object.entries(story)) {
      const path = ctx.routePath(story,step);
      assert.equal(path[0],'start');
      for (const [target] of node.links) {
        assert.equal(story[target].parent,step);
        assert.deepEqual(Array.from(ctx.travelPath(story,path,target)),[...path,target]);
      }
    }
  }
});
