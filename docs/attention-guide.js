'use strict';

const colourHelp = {
  white:'Можно отдохнуть или заняться своим делом. К разговору можно вернуться позже.',
  yellow:'Можно болтать с друзьями и замечать, что происходит вокруг. Например, услышать, что после шутки кто-то просит остановиться.',
  orange:'Одна деталь привлекла внимание. Можно уточнить, что произошло и чего хочет человек.',
  red:'Угроза уже рядом. Можно отойти к людям и позвать на помощь.'
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
    intro = element('details','colour-intro');
    const summary = element('summary','','Жёлтый · замечаю, что вокруг');
    intro.append(summary, element('p','',colourHelp.yellow),
      element('p','','Цвет на кнопке показывает, куда будет направлено внимание твоего героя.'));
    panel.querySelector('.scene-role').after(intro);
    onDisplay(summary,'yellow');
  }
  return {
    dismissIntro() {
      if (!intro) return;
      remember('yellow');
      if (observer) observer.unobserve(intro.querySelector('summary'));
      intro.remove();
      intro = null;
    },
    explainReaction(row) {
      row.append(element('strong','reaction-label','Чёрный · я замер'));
      mergeSaved();
      if (known.has('black')) return;
      const tip = element('p','reaction-hint');
      tip.append(levelTitle('black'),'Иногда от испуга трудно говорить или двигаться. Это случается само. Друг может побыть рядом и дать тебе время.');
      row.append(tip);
      onDisplay(tip,'black');
    },
    annotate(container) {
      const colours = new Set(Array.from(container.querySelectorAll('.coded'), option => option.dataset.code));
      const help = element('details','colour-help');
      help.append(element('summary','','Что означают цвета ответов?'));
      for (const colour of colours) {
        const entry = element('p');
        entry.dataset.code = colour;
        entry.append(levelTitle(colour),colourHelp[colour]);
        help.append(entry);
      }
      container.append(help);
    }
  };
}
