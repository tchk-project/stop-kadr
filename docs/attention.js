'use strict';

const attentionModes = {
  yellow: {name:'Жёлтый', meaning:'спокойно замечаю, что вокруг', chrome:'#59450a'},
  orange: {name:'Оранжевый', meaning:'слежу за конкретным сигналом', chrome:'#773c1b'},
  red:    {name:'Красный', meaning:'вижу угрозу прямо сейчас', chrome:'#792c39'},
  black:  {name:'Чёрный', meaning:'я замер', chrome:'#34383e'},
  white:  {name:'Белый', meaning:'переключаю внимание на своё', chrome:'#f8f9fa'}
};

function setAttentionMode(mode) {
  const {name,meaning,chrome} = attentionModes[mode];
  document.documentElement.dataset.code = mode;
  document.querySelector('#mode-name .level-name').textContent = name;
  document.querySelector('#mode-name .level-meaning').textContent = ' · '+meaning;
  document.querySelector('meta[name="theme-color"]').content = chrome;
}
