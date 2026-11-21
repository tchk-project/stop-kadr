'use strict';

// Run on the same origin as the published game. All play and review decisions
// go through the rendered controls. No game-state objects are read or changed.
let frame = document.querySelector('iframe');
const report = document.querySelector('#report');
const progress = document.querySelector('#progress');
const root = new URL('../',location.href);
// Fetch the current entry documents even if a previous run warmed the Pages cache.
root.searchParams.set('qa',Date.now().toString(36));
const doc = () => frame.contentDocument;
const find = selector => doc()?.querySelector(selector);
const buttons = () => [...doc().querySelectorAll('button.action.coded')];
const tick = () => new Promise(resolve => setTimeout(resolve,20));

function check(ok,message) { if (!ok) throw Error(message); }
async function until(test,label,skipPlayback=true) {
  const limit=Date.now()+40000;
  do {
    if (test()) return;
    const skip=find('.tape-skip:not([hidden])');
    if (skipPlayback && skip) skip.click();
    await tick();
  } while (Date.now()<limit);
  throw Error(label+' · '+frame.contentWindow.location.href);
}
async function openPage(url,selector) {
  await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(Error('Загрузка '+url)),45000);
    const next=document.createElement('iframe');
    next.title=frame.title;
    next.onload=()=>{ clearTimeout(timer); resolve(); };
    next.src=url;
    frame.replaceWith(next);
    frame=next;
  });
  await until(()=>find(selector),selector);
}
async function settled(expected) {
  await until(()=>frame.contentWindow.location.hash===expected && find('.scene:not([aria-busy])'),'Сцена '+expected);
}
async function click(button) {
  check(button && !button.disabled,'Кнопка недоступна');
  button.click();
  // Navigation and begin() set aria-busy synchronously.
  await until(()=>find('.scene:not([aria-busy])'),'Завершение перехода');
}
const named = name => [...doc().querySelectorAll('button')].find(b=>b.textContent.trim()===name);

async function exercise() {
  let endings=0, edges=0, reviews=0, events=0;
  const assets=new Set();
  const routes=new Set();
  await openPage(root,'.start-game');
  check(!find('a.case-card'),'Каталог открыт до выбора проверяющего');
  const reviewer=find('.reviewer-link');
  check(reviewer.textContent.includes('(для проверяющих)'),'Пометка входа в каталог');
  const swap=find('.take-toggle');
  const phone = find('.take-preview');
  const copy = find('.hero-copy');
  for (const width of [390,720,1024]) {
    frame.style.width = width+'px';
    const preview = phone.getBoundingClientRect();
    const intro = copy.getBoundingClientRect();
    if (width <= 720) check(preview.bottom <= intro.top,'Телефон над вступлением при ширине '+width);
    else check(intro.right <= preview.left,'Вступление слева от телефона на широком экране');
  }
  frame.style.removeProperty('width');
  report.textContent+='Главная · порядок блоков проверен при 390, 720 и 1024 пикселях\n';
  const initial = phone.textContent;
  const background = () => frame.contentWindow.getComputedStyle(phone).backgroundColor;
  const yellow = background();
  swap.click();
  check(phone.dataset.code==='orange' && find('.take-preview mark')?.textContent==='двести','Ответ с давлением');
  check(find('.preview-mode').textContent.startsWith('Оранжевый') && find('.preview-note').textContent.includes('требует деньги'),'Причина смены цвета');
  await until(()=>background()!==yellow,'Смена фона телефона');
  swap.click();
  check(phone.dataset.code==='yellow' && phone.textContent===initial,'Возврат первого ответа и цвета');
  const article=find('.cooper-link').href;
  const loaded = new Promise(resolve => frame.addEventListener('load',resolve,{once:true}));
  named('Начать').click();
  await loaded;
  check(find('.scene-loader:not([hidden])') && find('.panel[hidden]') && !find('.thread .item'),'Загрузчик до показа сцены');
  await new Promise((resolve,reject) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      clearTimeout(timeout);
      resolve();
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(Error('Подготовленный экран не показан'));
    },40000);
    observer.observe(find('.panel'),{attributes:true,attributeFilter:['hidden']});
  });
  check(find('.scene-loader[hidden]') && !find('.thread .item'),'Экран до первой реплики');
  if (!frame.contentWindow.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await until(()=>find('.thread .item'),'Первая реплика',false);
    check(doc().querySelectorAll('.thread .item').length===1,'Поочерёдное появление реплик');
  }
  report.textContent+='Старт ситуации · загрузка, пустая переписка, первая реплика\n';
  await until(()=>buttons().length && find('.scene:not([aria-busy])'),'Случайный старт с главной');
  for (const width of [320,360,390]) {
    frame.style.width=width+'px';
    const bar=find('.mode-bar');
    const height=Math.ceil(bar.getBoundingClientRect().height);
    check(height <= 60 && bar.scrollWidth <= bar.clientWidth,'Размер плашки при ширине '+width);
    report.textContent+='Плашка внимания · '+width+' × '+height+' пикселей\n';
  }
  frame.style.removeProperty('width');
  const first=new URL(frame.contentWindow.location.href).searchParams.get('case');
  named('Следующая').click();
  await until(()=>buttons().length && find('.scene:not([aria-busy])') &&
    new URL(frame.contentWindow.location.href).searchParams.get('case')!==first,'Смена ситуации');
  find('.playback-controls .reviewer-link').click();
  await until(()=>find('a.case-card'),'Возврат в список из переписки');
  check(doc().querySelectorAll('a.case-card').length===16,'В списке должны быть все 16 историй');
  await openPage(article,'article h1');
  check(!find('article button, article mark, article [hidden], article aside'),'Статья открыта для чтения целиком');
  check(find('article').innerText.includes('Все помнят сцену'),'Пример виден в тексте');
  for (const role of ['witness','self']) {
    const catalog=new URL(role==='self'?'docs/self.html':'docs/index.html',root);
    catalog.search=root.search;
    catalog.searchParams.set('view','cases');
    await openPage(catalog,'a.case-card');
    const links=[...doc().querySelectorAll('.case-card')].map(a=>[a.href,a.querySelector('.case-name').textContent]);
    const ids=new Set(links.map(([url])=>new URL(url).searchParams.get('case')));
    check(links.length===16 && ids.size===16 && ['speech','vision','abdomen','chest'].every(id=>ids.has(id)),'Состав каталога: '+role);
    for (const [url,title] of links) {
      const id=new URL(url).searchParams.get('case');
      const seen=new Set();
      const tally=endings;
      // Click a catalogue card, including the ordinary unseeded first draw.
      await openPage(catalog,'a.case-card');
      find('a.case-card[href*="case='+id+'&"]').click();
      await until(()=>buttons().length && find('.scene:not([aria-busy])'),'Вход из каталога');
      check(find('h1').textContent===title,'Заголовок карточки');
      for (const take of ['pressure','calm']) {
        await openPage(url+'#'+take,'.scene');
        await settled('#'+take);
        async function walk(hash) {
          check(!seen.has(hash),'Повтор узла '+hash);
          seen.add(hash);
          progress.textContent=role+' · '+title+' · '+hash+' · финалов '+endings;
          for(const el of doc().querySelectorAll('.thread img[src],.thread audio[src],.thread video[src],.thread source[src],.thread a[download]')) assets.add(el.src || el.href);
          check(!find('.coded[data-code="black"]'),'Чёрный появился на кнопке');
          const outcome=find('.outcome:not([hidden])');
          const expectedTheme=outcome && ['positive','negative'].includes(outcome.dataset.kind) ? outcome.dataset.kind : undefined;
          check(doc().documentElement.dataset.ending===expectedTheme,'Тема исхода');
          if(outcome) {
            endings++;
            check(find('#outcome-title').textContent,'Пустой финал');
            const reaction=find('.reaction-label');
            check(Boolean(reaction)===Boolean(find('.reaction-record')),'История замирания');
            if(reaction) {
              check(role==='self' && ['money','stairs','voice','team'].includes(id),'Чёрный у очевидца');
              events++;
            }
            if(take==='pressure') {
              await click(find('button.inspect'));
              do {
                const review=find('.decision-review:not([hidden])');
                check(review && review.querySelector('li') && review.querySelector('.chosen-answer') && !review.querySelector('select'),'Пустой разбор');
                check(!doc().documentElement.hasAttribute('data-ending'),'Цвет внимания при перемотке');
                reviews++;
                if(named('Дальше').disabled) break;
                await click(named('Дальше'));
              } while(true);
              while(!named('Назад').disabled) await click(named('Назад'));
              const retry=[...doc().querySelectorAll('button')].find(b=>/Попробовать другой ответ|Вернуться к выбору ответа/.test(b.textContent));
              await click(retry);
              check(buttons().length>1,'Повтор решения');
              // Replace the test frame before walking the next sibling. Restores
              // by its public bookmark, also exercising an actual page reload.
            } else {
              await click([...doc().querySelectorAll('button')].find(b=>b.textContent.includes('не так спокойно')));
              check(frame.contentWindow.location.hash==='#pressure','Переход в напряжённый дубль');
            }
            return;
          }
          const count=buttons().length;
          check(count,'Нет доступных ходов');
          for(let i=0;i<count;i++) {
            if(frame.contentWindow.location.hash!==hash || find('.decision-review:not([hidden])')) {
              await openPage(url+hash,'.scene');
              await settled(hash);
            }
            await click(buttons()[i]);
            edges++;
            await walk(frame.contentWindow.location.hash);
          }
        }
        await walk('#'+take);
      }
      routes.add(id+'/'+role);
      report.textContent+=role+' · '+title+' · '+(endings-tally)+' финалов\n';
    }
  }
  for(const url of assets) {
    const response=await fetch(url,{method:'HEAD'});
    check(response.ok,'Медиа '+response.status+' '+url);
  }
  check(events===8,'Ожидались два финала с замиранием в каждой из четырёх личных историй');
  return 'Проверено: '+routes.size+' прохождений, '+edges+' переходов, '+endings+' финалов, '+reviews+' остановок разбора, '+assets.size+' медиафайлов.';
}

document.querySelector('#run').onclick=async function() {
  this.disabled=true; report.textContent=''; progress.textContent='Открываю главную';
  try { progress.textContent=await exercise(); }
  catch(e){ progress.textContent='Ошибка: '+e.message; report.textContent+='\n'+e.stack; }
  finally {this.disabled=false;}
};
