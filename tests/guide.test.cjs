const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const {build,catalog} = require('./game-helper.cjs');
const source = readFileSync(__dirname+'/../docs/attention-guide.js','utf8');

function lesson(storage, story, perspective) {
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
  const guide = context.attentionGuide(panel, undefined, story, perspective);
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

test('medical colour help follows all eight roles before and after the call', () => {
  const characters = {
    speech:{witness:'Сашу', self:'Вере'},
    vision:{witness:'Веру', self:'Тимура'},
    chest:{witness:'папы', self:'Леру'},
    abdomen:{witness:'Мише', self:'Тимура'}
  };
  for (const [id, people] of Object.entries(characters)) {
    const meta = catalog.find(entry => entry.id === id);
    for (const [role, person] of Object.entries(people)) {
      const {story} = build(id, role);
      const {guide,options} = lesson({getItem:() => '["yellow"]'}, meta, role);
      function explanation(step, colour) {
        const node = story[step];
        const container = options(...node.links.map(([next]) => story[next].mode));
        guide.annotate(container, node.mode);
        const paragraphs = container.children.at(-1).children;
        return paragraphs.find(el => el.dataset.code === colour).children[1];
      }
      for (const step of ['pressure','wait']) {
        const help = explanation(step, 'red');
        assert.ok(help.includes(person), id+'/'+role+'/'+step);
        assert.match(help, /103|112/);
        assert.match(help, /скорую/);
      }
      assert.match(explanation('pressure','yellow'), /помощь нужна сразу/);
      assert.doesNotMatch(explanation('calm','yellow'), /скору|диспетчер|звонок/i);
      for (const step of ['call','call-now']) {
        assert.match(explanation(step,'red'), /Диспетчер уже на связи/);
      }
    }
  }
});
