'use strict';

function textNode(tag, text, css) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (css) el.className = css;
  return el;
}

function readerLink(label, href) {
  const link = textNode('a',label);
  link.href = href;
  return link;
}

function renderRole(meta, role) {
  const {story, cues, decisions} = prepareRoute(storyData,role);
  const person = meta.roles[role];
  const section = document.createElement('section');
  section.id = role;
  section.append(textNode('h2','Глазами '+person.viewpoint),textNode('p',person.intro));
  const stepId = id => role+'-'+id;

  function renderStep(id, number, label, previousChannel) {
    const node = story[id];
    function choiceLabel(target, choice) {
      if (id !== 'start') return choice;
      if (target === 'calm') return 'Спокойный дубль';
      const title = story[target].continuation;
      return typeof title === 'string' && title.trim() ? title : 'Напряжённый дубль';
    }
    const article = document.createElement('article');
    article.id = stepId(id);
    article.append(textNode('h3',number+'. '+label),textNode('small','Внимание · '+attentionModes[node.mode].name));
    let channel = previousChannel;
    for (const [index,line] of node.lines.entries()) {
      if (line.channel) channel = line.channel;
      if ((index === 0 || line.channel) && channel) {
        article.append(textNode('p',channel.title || 'Очная сцена','channel'));
      }
      const sentence = document.createElement('p');
      sentence.id = role+'-'+line.ref;
      if (line.caption) sentence.append(textNode('small',line.caption),document.createElement('br'));
      const speaker = line.speaker === 'Ты' ? person.name : line.speaker;
      sentence.append(textNode('strong',[speaker,line.aside].filter(Boolean).join(' · ')+' '));
      if (line.media) sentence.append(textNode('em',({
        voice:'Голосовое',video:'Видео',sticker:'Стикер',image:'Изображение',document:'Документ'
      })[line.media.kind]+' · '));
      sentence.append(line.parts?.text || line.media?.alt || '');
      if (line.media) {
        if (line.parts?.text && line.media.alt && line.parts.text !== line.media.alt) {
          sentence.append(' ',line.media.alt);
        }
        if (line.media.description) sentence.append(' ',line.media.description);
        sentence.append(' ',readerLink('Открыть вложение',line.media.file || line.media.src));
        if (line.media.html) sentence.append(' · ',readerLink('Прочитать слайды текстом',line.media.html));
      }
      if (line.reactions) {
        const names = Object.entries(line.reactions).map(([symbol,people]) => symbol+' '+people.join(', '));
        sentence.append(document.createElement('br'), textNode('small','Реакции · '+names.join(' / ')));
      }
      article.append(sentence);
      if (node.reaction?.index === index) article.append(textNode('p',node.reaction.summary));
    }
    if (id !== 'start') {
      const detail = decisions[id];
      if (detail) {
        const review = textNode('div','','review');
        review.append(textNode('strong','Что было видно до выбора'));
        const signals = document.createElement('ul');
        for (const ref of detail.signals) {
          const li = document.createElement('li');
          const [quote, explanation] = cues[ref];
          li.append(readerLink('«'+quote+'»','#'+role+'-'+ref), ' — '+explanation);
          signals.append(li);
        }
        review.append(signals,textNode('p',detail.effect));
        if (detail.repair) {
          review.append(textNode('p','Если выбрать «'+node.links.find(([key]) => key === detail.repair)[1]+'» — '+detail.recovery));
        }
        article.append(review);
      }
    }
    if (node.outcome) article.append(textNode('strong',node.outcome[1]),textNode('p',node.note));
    if (node.links.length) {
      article.append(textNode('p',id === 'start' ? 'Варианты первого дубля' : node.question,'question'));
      const links = document.createElement('ul');
      for (const [target,choice] of node.links) {
        const item = document.createElement('li');
        item.id = role+'-'+target+'/@choice';
        item.append(readerLink(choiceLabel(target,choice),'#'+stepId(target)));
        links.append(item);
      }
      article.append(links);
    }
    const navigation = textNode('div','','links');
    if (node.parent) navigation.append(readerLink('К предыдущей развилке','#'+stepId(node.parent)));
    if (id !== 'start') navigation.append(readerLink('Открыть этот момент в игре',
      './focus.html?case='+encodeURIComponent(meta.id)+'&role='+role+'#'+id));
    article.append(navigation);
    section.append(article);
    for (const [index,[target,choice]] of node.links.entries()) {
      renderStep(target,number+'.'+(index+1),choiceLabel(target,choice),channel);
    }
  }
  renderStep('start','1','Начало истории',{kind:'scene',title:''});
  return section;
}

function openReadingSheet() {
  const status = document.querySelector('#state');
  function showError() {
    status.textContent = 'Не удалось загрузить сценарий. ';
    status.append(readerLink('Повторить',location.href));
  }
  if (typeof allStories === 'undefined' || typeof prepareRoute !== 'function' || typeof attentionModes === 'undefined') {
    showError();
    return;
  }
  const selection = new URLSearchParams(location.search).get('case') || 'money';
  const meta = allStories.find(story => story.id === selection);
  const select = document.querySelector('#story');
  for (const item of allStories) select.add(new Option(item.title,item.id,false,item.id === selection));
  if (!meta) {
    status.textContent = 'История не найдена. Выберите её из списка.';
    return;
  }
  document.querySelector('#title').textContent = meta.title;
  document.title = meta.title+' · Сценарий для чтения';
  const script = document.createElement('script');
  script.src = './game/stories/'+meta.id+'.js?v=review-3';
  script.onload = () => {
    const nav = document.querySelector('#roles');
    for (const role of ['witness','self']) {
      nav.append(readerLink('Глазами '+meta.roles[role].viewpoint,'#'+role));
      document.querySelector('#script').append(renderRole(meta,role));
    }
    status.textContent = 'Выберите роль. В каждой развилке можно нажать на ответ и перейти к его последствиям.';
    const anchor = document.getElementById(location.hash.slice(1));
    if (anchor) anchor.scrollIntoView();
  };
  script.onerror = showError;
  document.head.append(script);
}

openReadingSheet();
