'use strict';

async function playAttentionPilot(ui) {
  const {pages, pathFor, messages, makeRow, button, scene, heading, thread, typing, flash,
    freeze, question, outcome, outcomeLabels, choices, controls, status, motionAllowed} = ui;
  const {story,cues,decisions} = ui.route;
  thread.className = 'chat-transcript';
  const guide = attentionGuide(document.querySelector('.panel'));
  const speed = 4;
  const bar = document.querySelector('.mode-bar');
  const levelBadge = [bar.querySelector('.signal'), bar.querySelector('.level-name')];
  const dropFrames = [
    {transform:'translateY(-10px) scale(1.55)'},
    {transform:'translateY(1px) scale(.98)', offset:.78},
    {transform:'none'}
  ];
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
    if (pages.has(hash) && hash !== 'start') return {id:hash, path:routePath(story,hash,history.state?.path), index:history.state?.reviewIndex};
    const id = pickAttentionTake();
    const path = routePath(story,id);
    history.replaceState({path}, '', '#'+id);
    return {id,path};
  }

  function navigate(id, index, mode = 'travel') {
    if (busy) return;
    const method = index != null && view.index != null ? 'replaceState' : 'pushState';
    const path = travelPath(story,view.path,id);
    history[method]({path,reviewIndex:index}, '', '#'+id);
    render({id, index, path}, mode);
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

  function scrollTo(el, behavior = 'instant') {
    if (el && ui.shouldFollow()) el.scrollIntoView({block:'nearest', behavior});
  }

  function changeColour(code, animated) {
    if (document.documentElement.dataset.code === code) return;
    const leavingReaction = document.documentElement.dataset.code === 'black';
    setAttentionMode(code);
    if (animated) {
      for (const part of levelBadge) {
        part.getAnimations().forEach(animation => animation.cancel());
        part.animate(dropFrames, {duration:420, easing:'cubic-bezier(.22,.65,.3,1)'});
      }
    }
    if (animated && code !== 'black' && !leavingReaction) {
      flash.getAnimations().forEach(a => a.cancel());
      flash.animate([{opacity:.85}, {opacity:0}], {duration:280, easing:'ease-out'});
    }
  }

  function drawSignal(row, key) {
    if (row.classList.contains('noticed')) return;
    const [, explanation] = cues[key];
    const words = row.querySelector('.cue-words');
    if (words) {
      const mark = element('mark','',words.textContent);
      words.replaceChildren(mark);
      const transcript = words.closest('details');
      if (transcript && !transcript.open) {
        transcript.open = true;
        transcript.dataset.openedByReview = '';
      }
    }
    row.classList.add('noticed');
    row.append(element('p', 'signal-caption', explanation));
  }

  function clearSignals() {
    for (const row of thread.querySelectorAll('.noticed')) {
      const mark = row.querySelector('mark');
      if (mark) mark.replaceWith(mark.textContent);
      const transcript = row.querySelector('[data-opened-by-review]');
      if (transcript) {
        transcript.open = false;
        delete transcript.dataset.openedByReview;
      }
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
    return {pause:long ? 2150 : 420+Math.min(420, item.content.textContent.length*4)};
  }

  function activityFor(content, channel) {
    const who = content.querySelector('strong')?.textContent.split(' · ')[0];
    const name = who === 'Ты' ? playerName : who;
    if (!name) return {label:'Твой выбор', kind:'dots'};
    if (name === 'Ремарка') return {label:'Сцена продолжается', kind:'dots'};
    if (name === 'Система') return {label:'Обновление чата', kind:'dots'};
    const types = [
      ['live-voice','говорит','voice'], ['voice','записывает голосовое','voice'],
      ['sticker','выбирает стикер','dots'], ['video','отправляет видео','upload'],
      ['document','прикрепляет файл','upload'], ['image','отправляет изображение','upload']
    ];
    const media = types.find(([type]) => content.classList.contains(type));
    if (media) return {label:name+' '+media[1], kind:media[2]};
    if (channel.kind === 'private' || channel.kind === 'group') return {label:name+' печатает сообщение', kind:'dots'};
    return {label:name+' говорит', kind:'voice'};
  }

  const stage = {title:'', kind:'scene'};
  function blockChannel(block) {
    return block ? {title:block.dataset.channel, kind:block.dataset.channelKind} : stage;
  }

  function blockFor(channel) {
    const {title,kind} = channel;
    const last = thread.lastElementChild;
    if (last && last.dataset.channel === title && last.dataset.channelKind === kind) return last;
    const block = element(title ? 'section' : 'div', 'thread');
    block.dataset.channel = title;
    block.dataset.channelKind = kind;
    if (title) {
      block.classList.add(kind === 'private' ? 'private-chat' : 'group-chat');
      block.append(element('h2','chat-heading',title));
    }
    thread.append(block);
    return block;
  }

  function showActivity(activity, channel) {
    const previous = typing.closest('.thread');
    typing.hidden = !activity;
    if (activity) {
      const block = blockFor(channel);
      if (typing.parentElement !== block) block.append(typing);
    } else {
      typing.remove();
    }
    if (previous && !previous.contains(typing) && !previous.querySelector('.item')) previous.remove();
    if (!activity) return;
    typing.dataset.kind = activity.kind;
    typing.querySelector('.typing-name').textContent = activity.label;
    if (typing.getBoundingClientRect().bottom > window.innerHeight) scrollTo(typing);
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
    const rows = [...thread.querySelectorAll('.item')];
    let common = 0;
    while (common < items.length && common < rows.length &&
           items[common].key === rows[common].dataset.key) common++;
    if (common < rows.length) direction.textContent = `◀◀ Назад · ${speed}×`;
    let reverseChannel = blockChannel(thread.lastElementChild);
    let reverseActivity = {label:'Перемотка назад', kind:'dots'};
    while (rows.length > common) {
      const row = rows.pop();
      if (!task.signal.aborted) {
        scrollTo(row);
        showActivity(reverseActivity, reverseChannel);
        await wait(Number(row.dataset.readingPause)/speed, task.signal);
        if (run !== task) return;
      }
      showActivity();
      await animateRow(row, true, speed, task);
      if (run !== task) return;
      const block = row.parentElement;
      row.remove();
      if (!block.querySelector('.item')) block.remove();
      const last = rows.at(-1);
      const code = last?.dataset.attention || 'yellow';
      changeColour(code, !task.signal.aborted);
      if (!task.signal.aborted) {
        scrollTo(last);
        reverseChannel = blockChannel(block);
        reverseActivity = {label:row.dataset.activity, kind:row.dataset.kind};
        showActivity(reverseActivity, reverseChannel);
        await wait(Number(row.dataset.pause)/speed, task.signal);
        if (run !== task) return;
        showActivity();
      }
    }
    if (common < items.length) direction.textContent = rate === speed ? `▶▶ Вперёд · ${speed}×` : '';
    let channel = blockChannel(thread.lastElementChild);
    const pending = items.slice(common).map(item => {
      channel = item.line?.channel || channel;
      const caption = item.line?.caption || '';
      return {item, context:{channel,caption}, activity:activityFor(item.content, channel)};
    });
    for (const [index, {item, context, activity}] of pending.entries()) {
      const {pause} = timing(item);

      if (!task.signal.aborted) {
        showActivity(activity, context.channel);
        await wait(pause/rate, task.signal);
        if (run !== task) return;
      }
      changeColour(item.attention, !task.signal.aborted);
      const block = blockFor(context.channel);
      const row = makeRow(item, context.caption);
      row.dataset.attention = item.attention;
      if (item.reaction) guide.explainReaction(row);
      const next = pending[index+1];
      row.dataset.readingPause = next ? readingPause(row) : 1000;
      row.dataset.pause = pause;
      row.dataset.activity = activity.label;
      row.dataset.kind = activity.kind;
      block.append(row);
      showActivity();
      if (!task.signal.aborted) scrollTo(row, rate === 1 ? 'smooth' : 'instant');
      await animateRow(row, false, rate, task);
      if (run !== task) return;
      if (!task.signal.aborted) {
        if (next) showActivity(next.activity, next.context.channel);
        await wait(Number(row.dataset.readingPause)/rate, task.signal);
        if (run !== task) return;
      }
      if (signals.includes(item.ref)) {
        showActivity();
        drawSignal(row, item.ref);
        if (!task.signal.aborted) {
          direction.textContent = 'Стоп-кадр · деталь';
          scrollTo(row);
          await wait(1250, task.signal);
          if (run !== task) return;
          direction.textContent = `▶▶ Вперёд · ${speed}×`;
        }
      }
    }
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
      const row = thread.querySelector('[data-ref="'+key+'"]');
      if (row) drawSignal(row,key);
    }
    review.append(title, list, element('p','chosen-answer',transitionLabel(attentionAtLine(story[stop.parent],story[stop.parent].lines.length-1),story[stop.id].mode)+' · '+stop.answer),
      element('p','',stop.effect));
    if (stop.recovery) review.append(element('p','recovery',stop.recovery));
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
      if (path.includes('calm')) {
        choices.append(element('p','calm-ending',kind === 'positive' ? 'В этот раз всё пошло хорошо.' : 'Так закончился этот дубль.'),
          button('rewind','А если бы всё пошло не так спокойно…',() => navigate('pressure')));
      } else if (stops.length) {
        choices.append(button('inspect',stops[0].miss ? 'Что я мог сделать иначе?' : 'Какие детали мне помогли?',
          () => navigate(view.id,0)));
      }
      const otherRole = role === 'self' ? 'witness' : 'self';
      const otherName = activeStory.roles[otherRole].viewpoint;
      const replayUrl = focusLink(activeStory.id,otherRole)+'#'+path[1];
      choices.append(button('forward','Посмотреть глазами '+otherName,() => leave(replayUrl),'play'));
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
    run.signal.addEventListener('abort', () => {
      for (const part of levelBadge) part.getAnimations().forEach(animation => animation.cancel());
    }, {once:true});
    old?.abort();
    busy = true;
    showActivity();
    ui.clearPrompt();
    clearSignals();
    review.replaceChildren();
    review.hidden = true;
    skip.hidden = false;
    direction.textContent = '';
    scene.setAttribute('aria-busy','true');
    ui.setFollow(true);
    return run;
  }

  function appendNavigation() {
    controls.append(button('forward','Следующая история',() => leave(randomStoryUrl(selection)),'play'),
      reviewerLink('К списку ситуаций'));
  }

  async function leave(url) {
    const task = begin();
    if (motionAllowed()) {
      direction.textContent = '◀◀ Следующая история';
      const tail = [...thread.querySelectorAll('.item')].slice(-3).reverse();
      for (const row of tail) {
        await animateRow(row,true,speed,task);
        if (run !== task) return;
        if (task.signal.aborted) break;
        const block = row.parentElement;
        row.remove();
        if (!block.querySelector('.item')) block.remove();
      }
    }
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
      const first = items.findIndex(item => stop.signals.includes(item.ref));
      if (first >= 0 && thread.querySelectorAll('.item').length > first) {
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
    showActivity();
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
  // Reveal the prepared shell with an empty thread before starting any dialogue timers.
  skip.hidden = true;
  review.hidden = true;
  scene.setAttribute('aria-busy','true');
  scene.classList.add('scene-opening');
  const panel = scene.closest('.panel');
  panel.hidden = false;
  document.querySelector('.scene-loader').hidden = true;
  await afterPaint();
  while (document.hidden) {
    await new Promise(resolve => document.addEventListener('visibilitychange',resolve,{once:true}));
    await afterPaint();
  }
  window.addEventListener('popstate', () => {
    if (location.hash === '#end') ui.finishScene();
    else render(readView(), 'travel');
  });
  if (location.hash === '#end') { ui.finishScene(); return; }
  const next = readView();
  const opening = pages.get(next.id).parent === 'start';
  await render(next, opening ? 'conversation' : 'restore');
  scene.classList.remove('scene-opening');
}
