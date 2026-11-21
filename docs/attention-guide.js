'use strict';

const colourHelp = {
  white:'Внимание переключилось на свои дела. Можно пропустить то, что случится дальше, даже если переписка всё ещё идёт.',
  orange:'Что-то конкретное привлекло внимание. Теперь ты следишь именно за этим и готов пересмотреть первую догадку.',
  red:'Ты видишь непосредственную угрозу и готов реагировать сейчас. Можно отойти в безопасное место или обратиться за помощью.'
};

function attentionGuide(panel) {
  const storageKey = 'stop-kadr.cooper.seen.v1';
  const known = new Set();
  function mergeSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) for (const colour of saved) if (colour in attentionModes) known.add(colour);
    } catch { /* Private or read-only storage: remember hints for this page. */ }
  }
  mergeSaved();
  function remember(colour) {
    mergeSaved();
    known.add(colour);
    try { localStorage.setItem(storageKey,JSON.stringify([...known])); } catch { /* In-memory fallback. */ }
  }
  const observer = typeof IntersectionObserver === 'function' && new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      remember(entry.target.dataset.lesson);
      observer.unobserve(entry.target);
    }
  }, {threshold:0.5});
  function onDisplay(el,colour) {
    el.dataset.lesson = colour;
    if (observer) observer.observe(el);
    else remember(colour);
  }
  function levelTitle(colour) {
    return element('strong','level-title',attentionModes[colour].name+' уровень');
  }
  let intro;
  if (!known.has('yellow')) {
    intro = element('aside','colour-intro');
    intro.setAttribute('aria-label','Первое прохождение');
    intro.append(levelTitle('yellow'),
      element('p','','Можно болтать с друзьями и замечать, что происходит вокруг. Например, услышать не только шутку, но и просьбу перестать. Так проще уловить перемену, даже когда ничего плохого не ждёшь.'),
      element('p','','Цвет на кнопке показывает, какой уровень внимания ты выбираешь. Каждая история начинается с жёлтого.'));
    panel.querySelector('.mode-bar').after(intro);
    onDisplay(intro,'yellow');
  }
  const bubbles = [];
  return {
    get introducingYellow() { return Boolean(intro); },
    clear() {
      for (const el of bubbles.splice(0)) if (observer) observer.unobserve(el);
    },
    dismissIntro() { if (intro) { remember('yellow'); if (observer) observer.unobserve(intro); intro.remove(); intro = null; } },
    explainReaction(row) {
      const label = element('strong','reaction-label','Чёрный · я замер');
      row.append(label);
      mergeSaved();
      if (known.has('black')) return;
      const tip = element('p','reaction-hint');
      tip.append(levelTitle('black'),'Иногда от неожиданности замираешь. Это случается само. В игре такая реакция не считается ошибкой.');
      row.append(tip);
      bubbles.push(tip);
      onDisplay(tip,'black');
    },
    annotate(options) {
      mergeSaved();
      const shown = new Set();
      for (const option of options) {
        const colour = option.dataset.code;
        if (!colourHelp[colour] || known.has(colour) || shown.has(colour)) continue;
        shown.add(colour);
        const bubble = element('p','colour-tip');
        bubble.append(levelTitle(colour),colourHelp[colour]);
        bubble.id = 'help-'+colour;
        bubble.dataset.code = colour;
        option.classList.add('new-colour');
        option.setAttribute('aria-describedby',bubble.id);
        option.after(bubble);
        bubbles.push(bubble);
        onDisplay(bubble,colour);
      }
    }
  };
}
