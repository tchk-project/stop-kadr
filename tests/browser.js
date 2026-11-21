'use strict';

// Run on the same origin as the published game. All play and review decisions
// go through the rendered controls. No game-state objects are read or changed.
let frame = document.querySelector('iframe');
const report = document.querySelector('#report');
const progress = document.querySelector('#progress');
const root = new URL('../',location.href);
const doc = () => frame.contentDocument;
const find = selector => doc()?.querySelector(selector);
const buttons = () => [...doc().querySelectorAll('button.action.coded')];
const tick = () => new Promise(resolve => setTimeout(resolve,20));

function check(ok,message) { if (!ok) throw Error(message); }
async function until(test,label) {
  const limit=Date.now()+40000;
  do {
    if (test()) return;
    const skip=find('.tape-skip:not([hidden])');
    if (skip) skip.click();
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
  await openPage(root,'a.case-card');
  const swap=find('.take-toggle');
  swap.click();
  check(find('.take-preview mark')?.textContent==='двести','Демонстрация');
  swap.click();
  const article=find('.cooper-link').href;
  await openPage(article,'.review-fragment button:not([hidden])');
  for(const b of doc().querySelectorAll('.review-fragment button')) {
    b.click();
    check(!doc().getElementById(b.getAttribute('aria-controls')).hidden,'Текст фрагмента');
    b.click();
    check(doc().getElementById(b.getAttribute('aria-controls')).hidden,'Закрытие фрагмента');
  }
  for (const role of ['witness','self']) {
    const catalog=new URL(role==='self'?'docs/self.html':'docs/index.html',root);
    await openPage(catalog,'a.case-card');
    const links=[...doc().querySelectorAll('.case-card')].map(a=>[a.href,a.querySelector('.case-name').textContent]);
    const ids=new Set(links.map(([url])=>new URL(url).searchParams.get('case')));
    check(links.length===14 && ids.size===14 && ids.has('speech') && ids.has('vision'),'Состав каталога: '+role);
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
                check(review && review.querySelector('li') && find('#moment-line option:nth-child(2)'),'Пустой разбор');
                reviews++;
                if(named('Дальше').disabled) break;
                await click(named('Дальше'));
              } while(true);
              while(!named('Назад').disabled) await click(named('Назад'));
              const selector=find('#moment-line');
              selector.selectedIndex=1;
              selector.dispatchEvent(new Event('change',{bubbles:true}));
              check(!find('.my-moment').hidden,'Мой момент');
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
