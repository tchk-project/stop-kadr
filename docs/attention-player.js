'use strict';

function playAttentionPilot(ui) {
  const {pages, pathFor, messages, makeRow, button, scene, heading, thread, typing, flash,
    freeze, question, outcome, outcomeLabels, choices, controls, status, motionAllowed} = ui;
  const {story,cues,decisions} = ui.route;
  const guide = attentionGuide(document.querySelector('.panel'));
  const speed = 2.5;
  const bar = document.querySelector('.mode-bar');
  const direction = element('span', 'tape-direction');
  direction.setAttribute('role', 'status');
  const skip = button('dismiss', 'Показать сразу', () => run?.abort(), 'play');
  skip.classList.add('tape-skip');
  bar.append(direction, skip);
  const review = element('section', 'decision-review');
  review.tabIndex = -1;
  review.setAttribute('aria-label', 'Разбор решений');
  choices.before(review);
  const frames = [{opacity:0, transform:'translateY(6px)'}, {opacity:1, transform:'translateY(0)'}];
  let run;
  let view;
  let busy = false;
  heading.textContent = pages.get('start').title;

  function readView() {
    const hash = location.hash.slice(1);
    if (pages.has(hash) && hash !== 'start') return {id:hash, index:history.state?.reviewIndex};
    const id = pickAttentionTake();
    history.replaceState(null, '', '#'+id);
    return {id};
  }

  function navigate(id, index, mode = 'travel') {
    if (busy) return;
    const method = index != null && view.index != null ? 'replaceState' : 'pushState';
    history[method]({reviewIndex:index,moments:[...chosenMoments]}, '', '#'+id);
    render({id, index}, mode);
  }

  function wait(ms, signal) {
    if (signal.aborted) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done, {once:true});
    });
  }

  function scrollTo(el) {
    if (el && ui.shouldFollow()) el.scrollIntoView({block:'nearest', behavior:'instant'});
  }

  function changeColour(code, animated) {
    if (document.documentElement.dataset.code === code) return;
    const leavingReaction = document.documentElement.dataset.code === 'black';
    setAttentionMode(code);
    if (animated && code !== 'black' && !leavingReaction) {
      flash.getAnimations().forEach(a => a.cancel());
      flash.animate([{opacity:.85}, {opacity:0}], {duration:280, easing:'ease-out'});
    }
  }

  function drawSignal(row, key) {
    const [snippet, explanation] = cues[key];
    const words = [...row.querySelectorAll('.msg p')].find(p => p.textContent.toLowerCase().includes(snippet.toLowerCase()));
    if (!words) return;
    const text = words.textContent;
    const start = text.toLowerCase().indexOf(snippet.toLowerCase());
    if (start < 0 || row.classList.contains('noticed')) return;
    words.replaceChildren(text.slice(0,start), element('mark','',text.slice(start,start+snippet.length)), text.slice(start+snippet.length));
    row.classList.add('noticed');
    row.append(element('p', 'signal-caption', explanation));
  }

  function clearSignals() {
    for (const row of thread.querySelectorAll('.noticed')) {
      const mark = row.querySelector('mark');
      mark.replaceWith(mark.textContent);
      row.querySelector('.signal-caption')?.remove();
      row.classList.remove('noticed');
    }
  }

  // Store each row's original timing so replay and reverse use the same pauses as first play.
  function timing(item) {
    const who = item.content.querySelector('strong')?.textContent.split(' · ')[0];
    if (!who) return {pause:180};
    const incoming = !['Ты','Ремарка','Система'].includes(who) && !item.content.classList.contains('live-voice') && !item.content.classList.contains('video');
    const line = Number(item.key.slice(item.key.lastIndexOf('-')+1));
    const long = incoming && (line+pathFor({id:item.step}).length)%3 === 0;
    return {speaker:incoming ? who : '', pause:long ? 2150 : 420+Math.min(420, item.content.textContent.length*4)};
  }

  function typingAs(speaker) {
    typing.hidden = !speaker;
    if (speaker) typing.querySelector('.typing-name').textContent = speaker+' пишет';
  }

  async function animateRow(row, backwards, rate, task) {
    if (task.signal.aborted) return;
    const effect = row.animate(frames, {duration:160/rate, easing:'ease-out', direction:backwards?'reverse':'normal'});
    const cancel = () => effect.cancel();
    task.signal.addEventListener('abort', cancel, {once:true});
    await effect.finished.catch(() => {});
    task.signal.removeEventListener('abort', cancel);
  }

  async function moveTo(items, rate, task, signals = []) {
    let common = 0;
    while (common < items.length && common < thread.children.length &&
           items[common].key === thread.children[common].dataset.key) common++;
    if (common < thread.children.length) direction.textContent = '◀◀ Назад · 2,5×';
    while (thread.children.length > common) {
      const row = thread.lastElementChild;
      if (!task.signal.aborted) scrollTo(row);
      await animateRow(row, true, speed, task);
      if (run !== task) return;
      row.remove();
      const last = thread.lastElementChild;
      const code = last?.dataset.attention || 'yellow';
      changeColour(code, !task.signal.aborted);
      if (!task.signal.aborted) {
        scrollTo(last);
        typingAs(row.dataset.speaker);
        await wait(Number(row.dataset.pause)/speed, task.signal);
        if (run !== task) return;
        typingAs('');
      }
    }
    if (common < items.length) direction.textContent = rate === speed ? '▶▶ Вперёд · 2,5×' : '';
    for (const item of items.slice(common)) {
      const {speaker, pause} = timing(item);

      if (!task.signal.aborted) {
        typingAs(speaker);
        await wait(pause/rate, task.signal);
        if (run !== task) return;
      }
      typingAs('');
      changeColour(item.attention, !task.signal.aborted);
      const row = makeRow(item);
      row.dataset.attention = item.attention;
      if (item.reaction) guide.explainReaction(row);
      row.dataset.pause = pause;
      row.dataset.speaker = speaker || '';
      thread.append(row);
      if (!task.signal.aborted) scrollTo(row);
      await animateRow(row, false, rate, task);
      if (run !== task) return;
      if (signals.includes(item.key)) {
        drawSignal(row, item.key);
        if (!task.signal.aborted) {
          direction.textContent = 'Стоп-кадр · деталь';
          scrollTo(row);
          await wait(1250, task.signal);
          if (run !== task) return;
          direction.textContent = '▶▶ Вперёд · 2,5×';
        }
      }
    }
  }

  const chosenMoments = new Map(history.state?.moments || []);
  thread.addEventListener('click',event => {
    if (busy || review.hidden || event.target.closest('button,a,audio,video,details')) return;
    const row = event.target.closest('.moment-eligible');
    if (!row) return;
    const input = review.querySelector('select');
    input.value = row.dataset.key;
    input.dispatchEvent(new Event('change'));
    status.textContent = 'Мой момент · '+input.selectedOptions[0].textContent;
  });
  function momentPicker(stop) {
    const key = stop.parent+'/'+stop.id;
    const form = element('div','moment-picker');
    const label = element('label','','Отметь реплику в переписке или выбери её здесь');
    const input = element('select');
    input.id = 'moment-line';
    label.htmlFor = input.id;
    const prompt = element('option','','Выбрать свой момент');
    prompt.value = '';
    input.append(prompt);
    const items = messages({id:stop.parent});
    for (const {key,content} of items) {
      const speaker = content.querySelector('strong');
      if (!speaker) continue;
      const media = content.querySelector('.chat-media');
      const speech = media
        ? [...media.querySelectorAll('p, img[alt]')].map(el => el.alt || el.textContent).filter(Boolean).join(' · ')
        : content.querySelector('p')?.textContent;
      if (!speech) continue;
      const option = element('option','',speaker.textContent+' · '+speech);
      option.value = key;
      thread.querySelector('[data-key="'+key+'"]')?.classList.add('moment-eligible');
      input.append(option);
    }
    const result = element('div','my-moment');
    result.setAttribute('aria-live','polite');
    function reflect() {
      result.replaceChildren();
      result.hidden = !input.value;
      if (!input.value) return;
      const row = thread.querySelector('[data-key="'+input.value+'"]');
      row?.classList.add('picked-moment');
      result.append(element('strong','','Мой момент'),element('blockquote','',input.selectedOptions[0].textContent),
        element('p','','Мой выбор на этой развилке · '+stop.answer));
    }
    input.value = chosenMoments.get(key) || '';
    input.onchange = () => {
      thread.querySelector('.picked-moment')?.classList.remove('picked-moment');
      chosenMoments.set(key,input.value);
      history.replaceState({...history.state,moments:[...chosenMoments]},'');
      reflect();
    };
    form.append(label,input,result);
    reflect();
    return form;
  }
  function showReview(stops, index) {
    const stop = stops[index];
    const title = element('h2', '', 'Решение '+(index+1)+' из '+stops.length);
    const list = element('ul', 'signal-list');
    for (const key of stop.signals) {
      const [quote, why] = cues[key];
      const li = element('li');
      li.append(element('b', '', '«'+quote+'»'), ' — '+why);
      list.append(li);
      const row = thread.querySelector('[data-key="'+key+'"]');
      if (row) drawSignal(row,key);
    }
    review.append(title, list, element('p','chosen-answer',transitionLabel(attentionAtLine(story[stop.parent],story[stop.parent].lines.length-1),story[stop.id].mode)+' · '+stop.answer),
      element('p','',stop.effect));
    if (stop.recovery) review.append(element('p','recovery',stop.recovery));
    review.append(momentPicker(stop));
    review.hidden = false;
    const nav = element('div','review-steps');
    const previous = button('rewind','Назад',() => navigate(view.id,index-1));
    const next = button('forward','Дальше',() => navigate(view.id,index+1),'play');
    previous.disabled = index === 0;
    next.disabled = index === stops.length-1;
    nav.append(previous,next);
    let retry = stop.parent;
    while (pages.get(retry).links.length < 2 && pages.get(retry).parent) retry = pages.get(retry).parent;
    choices.append(nav, button('rewind',retry === stop.parent ? 'Попробовать другой ответ' : 'Вернуться к выбору ответа',() => navigate(retry)));
    appendNavigation();
    return review;
  }

  function transitionLabel(before, after) {
    const names = {white:'белом',yellow:'жёлтом',orange:'оранжевом',red:'красном'};
    return before === after ? 'Остаться на '+names[after] : 'Перейти на '+attentionModes[after].name.toLowerCase();
  }

  function attentionTrail(path) {
    const detail = element('details','attention-trail');
    detail.append(element('summary','','Как менялось моё внимание'));
    const list = element('ol');
    for (const key of path.slice(2)) {
      const node = story[key];
      const parent = story[node.parent];
      const answer = parent.links.find(([id]) => id === key)[1];
      const item = element('li');
      item.append(element('strong','',transitionLabel(attentionAtLine(parent,parent.lines.length-1),node.mode)),element('p','',answer));
      const signals = decisions[key]?.signals;
      const quote = signals?.length && cues[signals[signals.length-1]]?.[0];
      if (quote) item.append(element('small','','Перед этим в истории: «'+quote+'»'));
      list.append(item);
      if (node.reaction) {
        const event = element('li','reaction-record');
        event.append(element('strong','','Что со мной произошло'),element('p','','Чёрный · '+node.reaction.summary));
        list.append(event);
      }
    }
    detail.append(list);
    return detail;
  }

  function showGame(data, path, stops) {
    if (data.outcome) {
      const {kind} = data.outcome;
      ui.showOutcome(data);
      choices.append(attentionTrail(path));
      if (healthScenes.includes(episode)) {
        const [label,href] = episode.source || ['О признаках инсульта и первой помощи · НМИЦ ТПМ Минздрава России','https://gnicpm.ru/articles/paczientam-articles/pervaya-pomoshh-pri-ostrom-narushenii-mozgovogo-krovoobrashheniya.html'];
        const source = element('a','cooper-link',label);
        source.href = href;
        source.target = '_blank';
        source.rel = 'noopener';
        choices.append(source);
      }
      if (path.includes('calm')) {
        choices.append(element('p','calm-ending',kind === 'positive' ? 'В этот раз всё пошло хорошо.' : 'Так закончился этот дубль.'),
          button('rewind','А если бы всё пошло не так спокойно…',() => navigate('pressure')));
      } else if (stops.length) {
        choices.append(button('inspect',stops[0].miss ? 'Что я мог сделать иначе?' : 'Какие детали мне помогли?',
          () => navigate(view.id,0)));
      }
    } else {
      freeze.hidden = false;
      question.textContent = data.question;
      for (const {id, label} of data.links) {
        const option = button('forward', label, () => {
          guide.dismissIntro();
          navigate(id, undefined, 'conversation');
        });
        const next = pages.get(id);
        const code = attentionModes[next.mode];
        option.dataset.code = next.mode;
        option.classList.add('coded');
        option.prepend(element('span','code-tag',transitionLabel(attentionAtLine(data,data.lines.length-1),next.mode)+' · '+code.meaning));
        choices.append(option);
      }
      guide.annotate(choices.querySelectorAll('.coded'));
      if (path.length > 2) controls.append(button('rewind','На шаг назад',() => navigate(data.parent)));
    }
    appendNavigation();
    return data.outcome ? outcome : question;
  }

  function begin() {
    guide.clear();
    ui.pauseMedia();
    const old = run;
    run = new AbortController();
    old?.abort();
    busy = true;
    ui.clearPrompt();
    clearSignals();
    for (const row of thread.querySelectorAll('.moment-eligible')) row.classList.remove('moment-eligible');
    thread.querySelector('.picked-moment')?.classList.remove('picked-moment');
    review.replaceChildren();
    review.hidden = true;
    skip.hidden = false;
    direction.textContent = '';
    scene.setAttribute('aria-busy','true');
    ui.setFollow(true);
    return run;
  }

  function appendNavigation() {
    controls.append(button('forward','Следующая',() => leave(randomStoryUrl(selection)),'play'),
      reviewerLink('К списку ситуаций'));
  }

  async function leave(url) {
    const task = begin();
    if (!motionAllowed()) task.abort();
    await moveTo([],speed,task);
    if (run === task) location.assign(url);
  }

  async function render(next, mode) {
    const task = begin();
    if (!view && guide.introducingYellow) ui.setFollow(false);
    view = next;
    const path = pathFor(next);
    const data = pages.get(next.id);
    const stops = attentionStops(path,story,decisions);
    const stop = Number.isInteger(next.index) && data.outcome && stops[next.index];
    if (!stop) view.index = undefined;
    const items = messages(next);
    if (!motionAllowed() || mode === 'restore') task.abort();
    if (stop) {
      const end = items.findIndex(item => item.key === stop.id+'-choice')+1;
      const first = items.findIndex(item => stop.signals.includes(item.key));
      if (thread.children.length > first && first >= 0) {
        await moveTo(items.slice(0,first),speed,task);
        if (run !== task) return;
      }
      await moveTo(items.slice(0,end),speed,task,stop.signals);
    } else {
      await moveTo(items,mode === 'conversation' ? 1 : speed,task);
    }
    if (run !== task) return;
    direction.textContent = '';
    skip.hidden = true;
    typingAs('');
    const target = stop ? showReview(stops,next.index) : showGame(data,path,stops);
    status.textContent = stop ? 'Разбор. Решение '+(next.index+1)+' из '+stops.length :
      data.outcome ? data.outcome.headline : 'Стоп-кадр. '+data.question;
    if (mode !== 'restore' && ui.shouldFollow()) {
      target.focus({preventScroll:true});
      scrollTo(target);
    }
    if (!task.signal.aborted && !stop && data.question) ui.flashFreeze();
    scene.removeAttribute('aria-busy');
    busy = false;
  }

  ui.reduced.addEventListener('change', () => { if (!motionAllowed()) run?.abort(); });
  window.addEventListener('popstate', () => {
    if (location.hash === '#end') ui.finishScene();
    else render(readView(), 'travel');
  });
  if (location.hash === '#end') { ui.finishScene(); return; }
  const opening = !location.hash || location.hash === '#start';
  render(readView(), opening ? 'conversation' : 'restore');
}
