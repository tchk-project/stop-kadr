const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(__dirname+'/../docs/attention-guide.js','utf8');

function lesson(saved) {
  const observed = new Set();
  const node = () => ({
    dataset:{}, classList:{add() {}}, append() {}, remove() {},
    after(value) { this.afterNode = value; },
    setAttribute(key,value) { this[key] = value; }
  });
  let visible;
  class Observer {
    constructor(notify) { visible = el => notify([{target:el,isIntersecting:true}]); }
    observe(el) { observed.add(el); }
    unobserve(el) { observed.delete(el); }
  }
  const panel = {querySelector:() => node()};
  const context = vm.createContext({localStorage:saved,IntersectionObserver:Observer,element:node,
    attentionModes:{white:{},yellow:{},orange:{},red:{}}});
  vm.runInContext(source,context);
  const guide = context.attentionGuide(panel);
  function option(colour) { const el = node(); el.dataset.code = colour; return el; }
  return {guide,observed,visible,option};
}

test('only yellow is introduced initially; new colours are attached to the first matching choice and remembered once visible',() => {
  const data = new Map();
  const storage = {getItem:k => data.get(k),setItem:(k,v) => data.set(k,v)};
  const first = lesson(storage);
  assert.deepEqual([...first.observed].map(el => el.dataset.lesson),['yellow']);
  first.visible([...first.observed][0]);
  const choices = ['yellow','orange','orange','white'].map(first.option);
  first.guide.annotate(choices);
  assert.deepEqual(choices.map(el=>el.afterNode?.dataset.lesson),[undefined,'orange',undefined,'white']);
  first.visible(choices[1].afterNode);
  first.guide.clear();
  const next = lesson(storage);
  assert.equal(next.guide.introducingYellow,false);
  const more = ['orange','white','red'].map(next.option);
  next.guide.annotate(more);
  assert.deepEqual(more.map(el=>el.afterNode?.dataset.lesson),[undefined,'white','red']);
});

test('blocked persistence still lets the player choose and suppresses repeated hints within a scene',() => {
  const {guide,visible,option} = lesson({getItem(){throw Error()},setItem(){throw Error()}});
  guide.dismissIntro();
  const red = option('red');
  guide.annotate([red]);
  visible(red.afterNode);
  const again = option('red');
  guide.annotate([again]);
  assert.equal(again.afterNode,undefined);
});
