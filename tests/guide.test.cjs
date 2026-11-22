const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(__dirname+'/../docs/attention-guide.js','utf8');

function lesson(storage) {
  const observed = new Set();
  function node(tag, className, textContent) {
    return {
      tag, className, textContent, children:[], dataset:{},
      append(...parts) { this.children.push(...parts); },
      after(el) { this.following = el; },
      remove() { this.removed = true; },
      querySelector(tag) { return this.children.find(el => el.tag === tag); },
      querySelectorAll(selector) { return this.children.filter(el => '.'+el.className === selector); }
    };
  }
  let visible;
  class Observer {
    constructor(notify) { visible = el => notify([{target:el,isIntersecting:true}]); }
    observe(el) { observed.add(el); }
    unobserve(el) { observed.delete(el); }
  }
  const role = node('p','scene-role');
  const panel = {querySelector:selector => selector === '.scene-role' && role};
  const context = vm.createContext({localStorage:storage,IntersectionObserver:Observer,element:node,
    attentionModes:{white:{name:'Белый'},yellow:{name:'Жёлтый'},orange:{name:'Оранжевый'},red:{name:'Красный'},black:{name:'Чёрный'}}});
  vm.runInContext(source,context);
  const guide = context.attentionGuide(panel);
  function options(...colours) {
    const el = node('nav','choices');
    for (const colour of colours) {
      const option = node('button','coded');
      option.dataset.code = colour;
      el.append(option);
    }
    return el;
  }
  return {guide,observed,visible,options,role,node};
}

test('first visit puts a collapsed yellow explanation after the role and remembers it when seen',() => {
  const data = new Map();
  const storage = {getItem:k => data.get(k),setItem:(k,v) => data.set(k,v)};
  const first = lesson(storage);
  const intro = first.role.following;
  assert.equal(intro.tag,'details');
  assert.equal(intro.querySelector('summary').dataset.lesson,'yellow');
  first.visible(intro.querySelector('summary'));
  assert.equal(lesson(storage).role.following,undefined);
});

test('colour explanations stay available in one disclosure after the action buttons on repeat visits',() => {
  const {guide,options} = lesson({getItem:() => '["yellow","white","orange"]'});
  const choices = options('white','orange','orange','yellow');
  guide.annotate(choices);
  assert.deepEqual(choices.children.map(el => el.tag),['button','button','button','button','details']);
  const help = choices.children.at(-1);
  assert.equal(help.querySelector('summary').textContent,'Что означают цвета ответов?');
  assert.deepEqual(help.children.slice(1).map(el => el.children[0].textContent),['Белый уровень','Оранжевый уровень','Жёлтый уровень']);
});

test('blocked storage still permits dismissing the intro and reading a spontaneous reaction',() => {
  const {guide,node,visible,observed,role} = lesson({getItem(){ throw Error(); },setItem(){ throw Error(); }});
  guide.dismissIntro();
  assert.ok(role.following.removed);
  const reaction = node();
  guide.explainReaction(reaction);
  const tip = [...observed][0];
  assert.equal(tip.dataset.lesson,'black');
  visible(tip);
  const repeat = node();
  guide.explainReaction(repeat);
  assert.deepEqual(repeat.children.map(el => el.textContent),['Чёрный · я замер']);
});
