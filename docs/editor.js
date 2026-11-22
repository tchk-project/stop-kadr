'use strict';
const app=document.querySelector('#app'), sheet=document.querySelector('#sheet'), formBody=document.querySelector('#form-body');
const preview=document.querySelector('#preview'), prefix='stop-kadr.editor.v1.';
const {plain,words,clone,roles}=Drafts;
let d, library=[], undo=[], noticeTimer, selectionToken=0, conflict=false, remoteEdit=false;
const pendingSaves=new WeakMap();
const attachmentPackageLimit=16_000_000;
const live=new Map();
function el(tag,text,cls){
  const node=document.createElement(tag);
  if(text!=null) node.textContent=text;
  if(cls)node.className=cls;
  return node;
}
function button(text,act,cls=''){
  const b=el('button',text,cls);b.type='button';b.addEventListener('click',act);return b;
}
function actions(...nodes){const box=el('div',null,'actions');box.append(...nodes);return box;}
function withHelp(label, topic, title, explanation){
  const wrap=el('div',null,'help-row'), hint=el('p',explanation,'help-text');
  hint.hidden=true;
  hint.id='help-'+topic;
  const toggle=button('?',()=>{
    hint.hidden=!hint.hidden;
    toggle.setAttribute('aria-expanded',String(!hint.hidden));
  },'help-toggle');
  toggle.setAttribute('aria-label','Справка. '+title);
  toggle.setAttribute('aria-controls',hint.id);
  toggle.setAttribute('aria-expanded','false');
  wrap.append(label,toggle,hint);
  return wrap;
}
function notice(text){const n=document.querySelector('#feedback');n.textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.textContent='',5500);}
function download(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type})), a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportDraft(){
  download(d.work.meta.title+'.stop-kadr.json',Drafts.pack(d),'application/json');
  if(sheet.open)sheet.close();
  notice('Отправь скачанный файл Сергею, чтобы он увидел твои правки.');
}
function characters(){
  return document.querySelector('#character-list').content.cloneNode(true);
}
function openCharacters(){
  const title=el('h2','Кто есть кто');
  title.id='dialog-title';
  formBody.replaceChildren(title,button('Вернуться к истории',()=>sheet.close()),characters());
  sheet.showModal();
}
function readLibrary(){
  library=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key.startsWith(prefix+'draft-'))continue;
    try{const value=JSON.parse(localStorage.getItem(key));if(value.format===Drafts.format)library.push(value);}catch{}
  }
  library.sort((a,b)=>(b.time||0)-(a.time||0));
}
function saveView(draft){
  const key=prefix+'view.'+draft.key, value=JSON.stringify(draft.view);
  try{sessionStorage.setItem(key,value);}catch{}
  try{localStorage.setItem(key,value);}catch{}
}
function restoreView(draft){
  const key=prefix+'view.'+draft.key;
  for(const store of ['sessionStorage','localStorage']){
    try{
      const view=JSON.parse(window[store].getItem(key));
      if(roles.includes(view?.role) && Object.hasOwn(draft.work.data.routes[view.role].scenes,view.step)){
        draft.view=view;return;
      }
    }catch{}
  }
}
function saveStatus(){
  if(conflict)return remoteEdit?'Другая версия сохранена в браузере. Твой черновик в памяти · скачай файл для сохранения.':'Черновик в памяти · скачай файл для сохранения';
  if(pendingSaves.has(d))return 'Сохраняем черновик…';
  if(remoteEdit)return 'В другой вкладке сохранена правка. Открой черновик заново, чтобы увидеть её. Если продолжишь редактировать здесь, появится отдельная версия.';
  if(d.parallel)return 'Твои правки сохранены отдельной версией. Обе версии доступны в «Моих черновиках».';
  return 'Черновик сохранён в этом браузере. Можно закрыть редактор и вернуться позже.';
}
function refreshStatus(){
  const status=app.querySelector('.workhead small');
  if(status)status.textContent=saveStatus();
}
function recoverPending(key){
  try{
    const pending=JSON.parse(sessionStorage.getItem(prefix+'pending.'+key));
    if(pending?.format===Drafts.format && pending.key===key)return pending;
  }catch{}
}
function clearPending(key){try{sessionStorage.removeItem(prefix+'pending.'+key);}catch{}}
function persist(){
  const draft=d, journalKey=d.key;
  // A reload can cancel a queued Web Lock before it runs. Keep this tab's unsaved edit until it lands.
  try{sessionStorage.setItem(prefix+'pending.'+journalKey,JSON.stringify(draft));}catch{}
  const save=()=>{
    const stored=JSON.parse(localStorage.getItem(prefix+draft.key));
    const fork=stored && stored.revision!==draft.revision;
    const next={...draft,time:Date.now(),revision:(draft.revision||0)+1};
    if(fork){next.key=Drafts.id('draft');next.revision=1;next.parallel=true;}
    localStorage.setItem(prefix+next.key,JSON.stringify(next));
    Object.assign(draft,next);saveView(draft);clearPending(journalKey);
    if(d===draft){
      if(fork)history.replaceState(null,'','#'+next.key);
      conflict=false;remoteEdit=false;
    }
  };
  // Serialize compare-and-write across tabs, including two saves made in the same instant.
  const write=async()=>{
    try{
      if(navigator.locks)await navigator.locks.request(prefix+'save',save);
      else save();
    }catch{
      if(d===draft){conflict=true;notice('Сохранение в браузере не удалось. Скачай черновик, чтобы сохранить правки.');}
    }
  };
  const done=write().finally(()=>{
    if(pendingSaves.get(draft)===done)pendingSaves.delete(draft);
    if(d===draft)refreshStatus();
  });
  pendingSaves.set(draft,done);
  return done;
}
function commit(change){
  const previous={work:clone(d.work),files:d.files};
  change();Drafts.pruneUnused(d);
  undo.push(previous);if(undo.length>16)undo.shift();
  persist();render();
}
function current(){const {role,step}=d.view;const r=d.work.data.routes[role];return {role,step,r,n:r.scenes[step]};}
function go(step,role=d.view.role){d.view={role,step};saveView(d);render();document.querySelector('.scenehead h2')?.focus();}
function openDraft(value,resumeView=true){
  d=value;undo=[];conflict=false;remoteEdit=false;Drafts.pruneUnused(d);if(resumeView)restoreView(d);
  location.hash=d.key;render();window.scrollTo(0,0);
}
function startDraft(value){openDraft(value);persist();refreshStatus();}
function syncHash(){
  const key=location.hash.slice(1);
  if(d && key===d.key)return;
  const pending=key && recoverPending(key);
  if(pending){openDraft(pending,false);persist();refreshStatus();return;}
  try{readLibrary();}catch{home();return;}
  const found=library.find(item=>key===item.key);if(found)openDraft(found);else home();
}
window.addEventListener('hashchange',syncHash);
window.addEventListener('storage',e=>{
  if(d && e.key===prefix+d.key && e.newValue){
    remoteEdit=JSON.parse(e.newValue).revision!==d.revision;refreshStatus();
  }
});
async function original(meta){
  if(live.has(meta.id))return live.get(meta.id);
  const resp=await fetch('./game/stories/'+encodeURIComponent(meta.id)+'.js',{cache:'no-store'});
  if(!resp.ok)throw Error('История не загрузилась. Проверь соединение и попробуй ещё раз.');
  const txt=(await resp.text()).trim(),header='const storyData = ';
  const pos=txt.indexOf(header);
  if(pos<0||!txt.endsWith(';'))throw Error('Формат истории не распознан.');
  const source={meta:clone(meta),data:JSON.parse(txt.slice(pos+header.length,-1))};
  Drafts.verifyWork(source);live.set(meta.id,source);return source;
}
async function editPublished(meta,copy=false){
  const token=++selectionToken;
  try{
    const source=await original(meta);if(token!==selectionToken)return;
    const value=Drafts.draft(source,copy?null:source);
    if(copy){const id=Drafts.id('story');value.work.meta.id=value.work.data.id=id;value.work.meta.title+=' — копия';}
    startDraft(value);
  }catch(e){notice(e.message);}
}
function card(title,small,act){const b=button('',act,'storycard');b.append(el('strong',title),el('small',small));return b;}
function home(){
  const draft=d, saving=draft && pendingSaves.get(draft);
  if(saving){saving.then(()=>{if(d===draft)home();});return;}
  if(d && conflict && !window.confirm('Черновик не сохранён. Выйти без сохранения?'))return;
  if(draft && conflict)clearPending(draft.key);
  ++selectionToken;d=null;undo=[];conflict=false;remoteEdit=false;if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  let storageOK=true;try{readLibrary();}catch{storageOK=false;}
  app.replaceChildren();
  const h=el('section',null,'homehead');
  h.append(el('h1','Редактор историй'),el('p','Открой историю, прочитай переписку и выбери ответ, чтобы увидеть продолжение.'));
  app.append(h);
  if(!storageOK)app.append(el('p','Браузер ограничил сохранение. Скачивай черновик файлом.','alert'));
  if(library.length){app.append(el('h2','Мои черновики'));const grid=el('div',null,'shelf');
    library.forEach(x=>grid.append(card(x.work.meta.title,(x.parallel?'Отдельная версия · ':'Продолжить · ')+new Date(x.time).toLocaleString('ru-RU'),()=>openDraft(clone(x)))));app.append(grid);}
  const cast=el('details',null,'cast-home');
  cast.append(el('summary','Кто есть кто'),characters());
  app.append(withHelp(el('h2','Какую историю хочешь проверить?'),'home','Работа с историями',
    'Выбери историю из игры — редактор создаст твою копию. Чтобы продолжить позже, открой её в «Моих черновиках». Если тебе уже прислали файл, нажми «Открыть файл черновика».'),cast);
  const grid=el('div',null,'shelf');
  allStories.forEach(m=>grid.append(card(m.title,m.place,()=>{
    const existing=library.find(x=>x.base?.meta.id===m.id);if(existing)openDraft(clone(existing));else editPublished(m);
  })));app.append(grid,actions(button('Написать историю',newStory),button('Открыть файл черновика',()=>document.querySelector('#import-file').click())));
}
let dirtyForm=false;
window.addEventListener('beforeunload',e=>{if(dirtyForm || conflict || pendingSaves.has(d)){e.preventDefault();e.returnValue='';}});
sheet.addEventListener('close',()=>{if(!sheet.open)dirtyForm=false;});
function discardForm(){return !dirtyForm || window.confirm('Отбросить несохранённые изменения? Чтобы продолжить писать, нажми «Отмена».');}
sheet.addEventListener('cancel',e=>{if(!discardForm())e.preventDefault();});
function form(title,build,accept,submit='Сохранить',focusAfter){
  const opener=document.activeElement;
  const f=el('form'), h=el('h2',title);h.id='dialog-title';f.append(h);
  const fields={};
  function field(key,label,value='',type='text',options){
    const wrapper=el('label',label);let control;
    if(options){control=el('select');for(const [v,l] of options)control.add(new Option(l,v));}
    else control=el(type==='textarea'?'textarea':'input');
    if(control.tagName==='INPUT')control.type=type;
    control.value=value??'';wrapper.append(control);f.append(wrapper);fields[key]=control;return control;
  }
  build(field,f,fields);
  dirtyForm=false;f.addEventListener('input',()=>dirtyForm=true);
  const save=el('button',submit,'primary');save.type='submit';
  const err=el('p',null,'alert');err.hidden=true;err.setAttribute('role','alert');
  f.append(err,actions(save,button('Отмена',()=>{if(discardForm())sheet.close();})));
  f.onsubmit=async e=>{e.preventDefault();if(save.disabled)return;save.disabled=true;try{
    const v=Object.fromEntries(Object.entries(fields).map(([k,c])=>[k,c.value.trim()]));
    const result=accept(v);
    if(result instanceof Promise)await result;
    if(!sheet.open || !f.isConnected)return;
    dirtyForm=false;sheet.close();
    if(focusAfter)focusAfter();
    else if(!opener.isConnected)app.querySelector('.scenehead h2')?.focus();
  }catch(e){err.textContent=e.message;err.hidden=false;}
  finally{save.disabled=false;}};
  formBody.replaceChildren(f);sheet.showModal();
}
function needed(s,msg){if(!s)throw Error(msg);return s;}
function newStory(){
  form('Новая история',(field)=>{
    field('title','Как называется история?').required=true;
    field('name','Как зовут героя, с которым это происходит?','Лера').required=true;
    field('witness','Кто видит это со стороны?','Вера').required=true;
  },v=>{const value=Drafts.draft(Drafts.blank(v.title,v.witness,v.name),null);startDraft(value);},'Начать писать');
}
function metadata(){
  const m=d.work.meta;
  form('Об истории',(field)=>{
    field('title','Название',m.title).required=true;field('place','Где происходит история?',m.place);
    for(const r of roles){
      const a=m.roles[r], label=r==='self'?'Участник ситуации':'Очевидец';
      field(r,label,a.name).required=true;
      field(r+'view','В кнопке «Посмотреть глазами кого?»',a.viewpoint);
      field(r+'intro','Что герой знает в начале?',a.intro,'textarea');
    }
  },v=>commit(()=>{m.title=v.title;m.place=v.place;
    roles.forEach(r=>{m.roles[r]={name:v[r],viewpoint:v[r+'view'],intro:v[r+'intro']};});
  }));
}
function heading(r,step){
  if(step==='start')return 'Начало истории';
  if(step==='calm')return 'Спокойный вариант';
  if(step==='pressure')return 'Вариант с давлением';
  const parent=Drafts.pathTo(r,step).at(-2);
  return plain(r.scenes[parent]?.choices?.[step])||'Продолжение';
}
function roleLabel(role){return d.work.meta.roles[role].name+' · '+(role==='self'?'участник':'очевидец');}
function readText(parent,text){
  const match=/\[\[([^\]]+)\]\]/.exec(text);
  if(match)parent.append(text.slice(0,match.index),el('mark',match[1]),text.slice(match.index+match[0].length));
  else parent.textContent=text;
}
function msgView(container,msg){
  const {role}=d.view;
  container.append(el('strong',msg.speaker==='Ты'?'Ты · '+d.work.meta.roles[role].name:msg.speaker));
  if(msg.aside)container.append(el('small',msg.aside));if(msg.caption)container.append(el('small',msg.caption));
  if(msg.reply)container.append(el('small',msg.reply));
  if(msg.media){
    const m=msg.media;container.append(el('small',Drafts.mediaName[m.kind]));
    if(m.kind==='voice'||m.kind==='video'){const play=el(m.kind==='voice'?'audio':'video');play.controls=true;play.preload='none';play.src=d.files?.[m.src]||m.src;container.append(play);}
    else{const img=el('img');img.src=d.files?.[m.src]||m.src;img.alt=plain(m.alt);container.append(img);}
    if(m.kind==='document'){const l=el('a','Открыть документ');l.href=m.file;l.target='_blank';l.rel='noopener';container.append(l);}
  }
  const p=el('p');readText(p,words(msg));container.append(p);
  if(msg.reactions)container.append(el('small',Object.entries(msg.reactions).map(([e,people])=>e+' '+people.join(', ')).join(' · ')));
}
function cueFields(field,body,original,explanation){
  const label=explanation?'Фраза для разбора':'Фраза для разбора (по желанию)';
  const detail=field('quote',label,Drafts.quote(original));
  const why=field('why','Что в этой фразе важно?',explanation);
  const pick=button('Отметить выделенную фразу',()=>{
    const selected=body.value.slice(body.selectionStart,body.selectionEnd);
    if(selected){
      detail.value=selected;detail.dispatchEvent(new Event('input',{bubbles:true}));why.focus();
    }else{detail.focus();notice('Выдели фразу в тексте или впиши её в поле.');}
  },'quiet');
  detail.parentElement.before(pick);
}
function markedInput(text,values,linked,original){
  const marked=Drafts.markText(text,values.quote);
  if(!values.quote && (linked || values.why))throw Error('Укажи фразу, к которой относится пояснение в разборе.');
  if(!values.why && (linked || (values.quote && !Drafts.quote(original))))throw Error('Объясни, что в этой фразе важно для разбора.');
  return marked;
}
function editMessage(key,index){
  const {role,step,r,n}=current(),data=d.work.data,old=data.messages[key],shared=old?Drafts.uses(data,key):[];
  const channels=[['','Продолжить в том же месте'],...Object.entries(data.channels).map(([k,ch])=>[k,ch.title||'Личный разговор при встрече']),['+','Добавить чат или место…']];
  const speakers=[...new Set(['Ты','Ремарка','Система',...Object.values(data.messages).map(m=>m.speaker),...roles.map(r=>d.work.meta.roles[r].name)])];
  form(old?'Изменить реплику':'Добавить реплику',(field,f)=>{
    const who=field('who','Кто говорит?',old?.speaker??'Ты');
    const list=el('datalist');list.id='speakers';speakers.forEach(s=>list.append(new Option(s)));f.append(list);who.setAttribute('list',list.id);who.required=true;
    const chan=field('channel','Где?',old?.channel??'','',channels);
    const kind=field('kind','Какой разговор?','private','',[['private','Личная переписка'],['group','Общий чат'],['voice','Голосовой канал'],['scene','При встрече']]);
    const name=field('name','Название для игрока');
    const toggle=()=>{kind.parentElement.hidden=name.parentElement.hidden=chan.value!=='+';};chan.onchange=toggle;toggle();
    const body=field('body',old?.media?'Текст или описание вложения':'Реплика',plain(old?words(old):''),'textarea');body.required=true;
    cueFields(field,body,old?words(old):'',r.cues[step+'/'+key]||'');
    if(shared.length>1){
      f.append(el('p','Реплика используется в '+shared.length+' местах. Герои: '+[...new Set(shared.map(x=>d.work.meta.roles[x.role].name))].join(', ')+'.','inline-help'));
      field('scope','Где применить правку?','one','',[['one','Только здесь'],['all','Во всех этих местах']]);
    }
  },v=>{
    const text=markedInput(v.body,v,Object.hasOwn(r.cues,step+'/'+key),old?words(old):'');
    if(v.channel==='+' && v.kind!=='scene')needed(v.name,'Введи название чата.');
    if(old && !v.quote && shared.some(x=>data.routes[x.role].cues[x.step+'/'+key] && (v.scope==='all'||(x.role===role && x.step===step))))throw Error('Эта фраза уже связана с разбором. Отметь её в новом тексте.');
    commit(()=>{
      let target=key;
      if(!old){target=Drafts.id('line');data.messages[target]={};n.messages.splice(index,0,target);}
      else if(shared.length>1 && v.scope==='one')target=Drafts.detach(data,role,step,key);
      const msg=data.messages[target];msg.speaker=v.who;
      if(v.channel==='+'){const id=Drafts.id('chat');data.channels[id]={kind:v.kind,title:v.kind==='scene'?'':v.name};msg.channel=id;}
      else if(v.channel)msg.channel=v.channel;else delete msg.channel;
      if(msg.media){const prop='transcript' in msg.media?'transcript':'caption' in msg.media?'caption':'alt';msg.media[prop]=text;}
      else msg.text=text;
      if(v.why)r.cues[step+'/'+target]=v.why;
    });
  },undefined,()=>document.getElementById('edit-message-'+index)?.focus());
}
function sceneForm(){
  const {n,step}=current();
  form('Этот фрагмент',(field)=>{
    field('mode','Уровень внимания',n.mode,'',Object.entries(Drafts.levels));
    if(step!=='start')field('question','Вопрос перед выбором',n.question||'','textarea');
  },v=>commit(()=>{n.mode=v.mode;if(step!=='start')n.question=v.question;}));
}
function branch(target){
  const {r,n}=current(), original=target?n.choices[target]:'';
  form(target?'Изменить ответ':'Добавить вариант ответа',(field,f)=>{
    if(!target)f.append(el('p','После сохранения откроется продолжение. Там ты напишешь, что произойдёт после этого ответа.','inline-help'));
    const body=field('label','Что выберет игрок?',plain(original),'textarea');body.required=true;
    cueFields(field,body,original,r.cues[target+'/@choice'] || '');
    if(!target){field('question','Вопрос игроку',n.question||'Что сделаешь?');field('mode','Уровень после выбора',n.mode,'',Object.entries(Drafts.levels));}
  },v=>{
    const key=target || Drafts.id('answer'),ref=key+'/@choice';
    const label=markedInput(v.label,v,Object.hasOwn(r.cues,ref),original);
    commit(()=>{
      n.choices??={};n.choices[key]=label;
      if(v.why)r.cues[ref]=v.why;
      if(!target){n.question=v.question;r.scenes[key]={mode:v.mode,messages:[]};d.view.step=key;}
    });
  });
}
function ending(){
  const {n}=current();
  form('Чем всё закончилось?',field=>{
    field('kind','Какой исход?',n.outcome?.[0]||'open','',Object.entries(Drafts.endings));
    field('title','Что произошло?',n.outcome?.[1]||'').required=true;
    field('note','Что объяснить игроку?',n.note||'','textarea').required=true;
  },v=>commit(()=>{n.outcome=[v.kind,v.title];n.note=v.note;delete n.choices;delete n.question;}));
}
function reviewForm(){
  const {step,r,n}=current(),path=Drafts.pathTo(r,step).slice(0,-1);
  const entries=Object.entries(r.cues).filter(([ref])=>path.includes(ref.split('/')[0]));
  const boxes=[];
  form('Разбор выбора',(field,f)=>{
    if(!entries.length)f.append(el('p','Сначала выбери фразу в предыдущей реплике, описании вложения или ответе игрока. Добавь к ней пояснение.'));
    for(const [ref,why] of entries){
      const label=el('label'),check=el('input');check.type='checkbox';check.checked=n.review?.signals.includes(ref)||false;boxes.push([ref,check]);
      label.append(check,' «'+Drafts.quote(Drafts.cueWords(d.work.data,r,ref))+'» — '+why);f.append(label);
    }
    field('effect','Что изменилось после ответа?',n.review?.effect||'','textarea');
    field('miss','Как показать этот выбор?',n.review?.miss?'yes':'no','',[['no','Деталь помогла'],['yes','Деталь пропущена']]);
  },v=>{const signals=boxes.filter(x=>x[1].checked).map(x=>x[0]);if(!signals.length && v.effect)throw Error('Выбери хотя бы одну отмеченную фразу.');
    if(signals.length)needed(v.effect,'Напиши пояснение для игрока.');
    commit(()=>{if(signals.length)n.review={...n.review,signals,effect:v.effect,miss:v.miss==='yes'};else delete n.review;});
  });
}
function stateText(role,step){
  if(Drafts.isChecked(d,role,step))return 'Проверено';
  return d.checked[role+'/'+step]?'Изменено после проверки':'Ещё не проверено';
}
function nextUnread(){
  const {role,step}=current();const order=[];
  for(const r of [role,...roles.filter(v=>v!==role)]) {
    const tree=d.work.data.routes[r];
    function walk(key){order.push([r,key]);Object.keys(tree.scenes[key].choices||{}).forEach(walk);}
    walk('start');
  }
  const index=order.findIndex(([r,s])=>r===role&&s===step);
  const target=[...order.slice(index+1),...order.slice(0,index+1)].find(([r,s])=>!Drafts.isChecked(d,r,s));
  if(target)go(target[1],target[0]);else notice('Обе роли полностью проверены.');
}
function inspect(){
  const errors=Drafts.issues(d.work),title=el('h2','Проверка истории');title.id='dialog-title';formBody.replaceChildren(title);
  if(d.base && live.has(d.base.meta.id) && JSON.stringify(d.base)!==JSON.stringify(live.get(d.base.meta.id)))formBody.append(el('p','Опубликованная история уже изменилась. Перед переносом понадобится сверить версии.','alert'));
  if(!errors.length)formBody.append(el('p','У обеих ролей заполнены реплики, варианты ответа и финалы.'));
  else errors.forEach(e=>{
    const r=e.role&&d.work.data.routes[e.role],where=e.step?roleLabel(e.role)+' · '+heading(r,e.step):'Об истории';
    formBody.append(card(e.message,where,()=>{
      sheet.close();
      if(e.step)go(e.step,e.role);
      if(e.meta)metadata();
      if(e.choice)branch(e.choice);
      if(e.line)editMessage(e.line,r.scenes[e.step].messages.indexOf(e.line));
    }));
  });
  formBody.append(actions(button('Вернуться к тексту',()=>sheet.close()),button('Скачать для передачи',exportDraft)));sheet.showModal();
}
function exportReading(){
  const lines=[d.work.meta.title,d.work.meta.place,''];
  for(const role of roles){
    const r=d.work.data.routes[role];
    lines.push('ГЛАЗАМИ ГЕРОЯ · '+roleLabel(role),d.work.meta.roles[role].intro,'');
    function walk(key,number,channel){
      const n=r.scenes[key];lines.push(number+'  '+heading(r,key),'Уровень — '+Drafts.levels[n.mode]);
      for(const id of n.messages){const m=d.work.data.messages[id];if(m.channel)channel=d.work.data.channels[m.channel];
        if(channel)lines.push('['+(channel.title||'При встрече')+']');
        if(m.caption)lines.push(m.caption);
        const speaker=m.speaker==='Ты'?'Ты · '+d.work.meta.roles[role].name:m.speaker;
        lines.push([speaker,m.aside].filter(Boolean).join(' · ')+' — '+(m.media?'('+Drafts.mediaName[m.media.kind]+') ':'')+plain(words(m)));
        if(m.reply)lines.push(m.reply);
        if(m.media?.alt && m.media.alt!==words(m))lines.push(plain(m.media.alt));
        if(m.media?.description)lines.push(plain(m.media.description));
        if(m.reactions)lines.push('Реакции · '+Object.entries(m.reactions).map(([symbol,names])=>symbol+' '+names.join(', ')).join(' / '));
        if(n.reaction?.from===id)lines.push(n.reaction.summary);
        if(r.cues[key+'/'+id])lines.push('Деталь для разбора — '+r.cues[key+'/'+id]);
      }
      if(n.question)lines.push(n.question);
      const options=Object.entries(n.choices||{});
      options.forEach(([k,label],i)=>{
        lines.push('→ '+number+'.'+(i+1)+'  '+plain(label));
        if(r.cues[k+'/@choice'])lines.push('Деталь ответа — «'+Drafts.quote(label)+'» — '+r.cues[k+'/@choice']);
      });
      if(n.outcome)lines.push('Финал — '+n.outcome[1],n.note);
      if(n.review)lines.push('Разбор — '+n.review.effect,...n.review.signals.map(ref=>'• «'+Drafts.quote(Drafts.cueWords(d.work.data,r,ref))+'» — '+r.cues[ref]));
      lines.push('');options.forEach(([k],i)=>walk(k,number+'.'+(i+1),channel));
    }
    walk('start','1',null);
  }
  download(d.work.meta.title+' — для вычитки.txt','\uFEFF'+lines.join('\r\n'),'text/plain;charset=utf-8');
}
function showPreview(key){
  const {role,step}=current();
  const snapshot=clone(d.work);
  for(const msg of Object.values(snapshot.data.messages)) if(msg.media && d.files?.[msg.media.src])msg.media.src=d.files[msg.media.src];
  window.editorPreviewSnapshot=snapshot;
  const query=new URLSearchParams({case:d.work.meta.id,role});
  if(typeof key==='string')query.set('from',step+'/'+key);
  preview.querySelector('iframe').src='./editor-preview.html?'+query+'#'+(step==='start'?'pressure':step);
  preview.showModal();
}
document.querySelector('#close-preview').onclick=()=>preview.close();
preview.addEventListener('close',()=>{preview.querySelector('iframe').removeAttribute('src');delete window.editorPreviewSnapshot;});
document.querySelector('#import-file').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const value=Drafts.unpack(await f.text());
    startDraft(value);
    const m=allStories.find(item=>item.id===value.base?.meta.id);
    if(m){const latest=await original(m);if(d===value && JSON.stringify(value.base)!==JSON.stringify(latest))notice('Исходная история в игре уже изменилась. Подробности в проверке.');}
  }catch(e){notice(e.message);}
};
function render(){
  if(!d)return home();
  const {role,step,r,n}=current(),data=d.work.data;
  app.replaceChildren();app.append(button('← Все истории',home,'quiet'));
  const head=el('div',null,'workhead'),title=el('div');
  title.append(el('h1',d.work.meta.title),withHelp(el('small',saveStatus()),'draft','Сохранение и передача','После правки нажми «Сохранить». Чтобы другой человек увидел изменения, скачай файл и отправь ему. Он сможет открыть файл в своём редакторе. Публикация в игре — отдельный шаг.'));
  head.append(title,actions(button('Скачать для передачи',exportDraft),button('Проверить в игре',showPreview,'primary')));app.append(head);
  const layout=el('div',null,'layout'),rail=el('aside',null,'rail'),article=el('article');layout.append(rail,article);app.append(layout);
  const rl=el('label','Чьими глазами читаем?'),select=el('select');rl.htmlFor=select.id='read-as';roles.forEach(k=>select.add(new Option(roleLabel(k),k)));select.value=role;
  select.onchange=()=>go('start',select.value);rail.append(withHelp(rl,'role','Выбор героя','Участник переживает ситуацию сам. Очевидец видит её со стороны и может вмешаться. Выбери имя, чтобы прочитать историю с начала глазами этого героя.'),select,button('Кто есть кто',openCharacters,'quiet'));
  const routeStamp=Object.keys(r.scenes).filter(k=>Drafts.isChecked(d,role,k)).length;
  rail.append(el('p','Проверено фрагментов: '+routeStamp+' из '+Object.keys(r.scenes).length,'where'),button('Следующий непроверенный',nextUnread));
  const tools=el('details');tools.append(el('summary','Действия с историей'));
  const menu=el('div',null,'tools');const undoButton=button('Отменить правку',()=>{const previous=undo.pop();d.work=previous.work;d.files=previous.files;if(!d.work.data.routes[role].scenes[step])d.view.step='start';persist();render();});
  undoButton.disabled=!undo.length;
  menu.append(button('Название и герои',metadata),undoButton,button('Проверить историю',inspect),button('Скачать для вычитки',exportReading),
    button('Создать копию',()=>{const value=Drafts.draft(d.work,null);value.work.meta.id=value.work.data.id=Drafts.id('story');value.work.meta.title+=' — копия';if(d.files)value.files=clone(d.files);startDraft(value);}));
  tools.append(menu);rail.append(tools);
  const path=Drafts.pathTo(r,step),head2=el('div',null,'scenehead');
  if(path.length>1)head2.append(button('← К другим ответам',()=>go(path.at(-2)), 'quiet'));
  const name=el('h2',heading(r,step));name.tabIndex=-1;head2.append(name,withHelp(el('small','Уровень · '+Drafts.levels[n.mode]),'level','Уровни внимания','Здесь указан уровень в начале фрагмента. На карточке ответа видно, как он изменится. Например, переход с жёлтого на оранжевый означает, что герой заметил конкретный повод насторожиться.'));
  head2.append(actions(button('Изменить фрагмент',sceneForm,'quiet'),el('span',stateText(role,step),'tag')));article.append(head2);
  if(step==='start')article.append(el('p',d.work.meta.roles[role].intro));
  if(path.length>1){
    const history=el('details',null,'reviewbox');history.append(el('summary','Что было до этого'));
    let lastChannel;
    for(const earlier of path.slice(0,-1)){
      history.append(el('h3',heading(r,earlier)));
      for(const key of r.scenes[earlier].messages){
        const m=data.messages[key];
        if(m.channel && m.channel!==lastChannel){history.append(el('small',data.channels[m.channel].title||'При встрече'));lastChannel=m.channel;}
        const line=el('div',null,'message');msgView(line,m);history.append(line);
      }
    }
    article.append(history);
  }
  let channel,group;
  for(const k of path.slice(0,-1))for(const id of r.scenes[k].messages){const m=data.messages[id];if(m.channel)channel=m.channel;}
  n.messages.forEach((key,index)=>{
    const m=data.messages[key];
    if(!group || (m.channel && m.channel!==channel)){
      channel=m.channel||channel;const ch=data.channels[channel];group=el('section',null,'group '+(ch?.kind==='private'?'private':''));
      group.append(el('h3',ch?.title||'При встрече'));article.append(group);
    }
    const box=el('div',null,'message');msgView(box,m);
    if(r.cues[step+'/'+key])box.append(el('small','В разборе · '+r.cues[step+'/'+key]));
    const edit=button('Изменить реплику',()=>editMessage(key,index),'quiet');edit.id='edit-message-'+index;
    box.append(actions(edit,button('Вставить перед',()=>editMessage(null,index),'quiet'),button('Проиграть отсюда',()=>showPreview(key),'quiet')));const more=el('details');more.append(el('summary','Ещё действия'));
    const up=button('Выше',()=>commit(()=>{[n.messages[index-1],n.messages[index]]=[n.messages[index],n.messages[index-1]];}));
    const down=button('Ниже',()=>commit(()=>{[n.messages[index+1],n.messages[index]]=[n.messages[index],n.messages[index+1]];}));
    up.disabled=index===0 || Boolean(n.reaction);down.disabled=index===n.messages.length-1 || Boolean(n.reaction);
    more.append(actions(up,down,button('Убрать реплику',()=>{
      const ref=step+'/'+key;
      if(Object.values(r.scenes).some(node=>node.review?.signals.includes(ref)) || [n.reaction?.from,n.reaction?.through].includes(key)){
        notice('Реплика участвует в разборе или реакции героя. Сначала измени связанную сцену.');return;
      }
      commit(()=>{n.messages.splice(index,1);delete r.cues[ref];if(!Drafts.uses(data,key).length)delete data.messages[key];});
    })));box.append(more);group.append(box);
  });
  article.append(actions(button('＋ Добавить реплику',()=>editMessage(null,n.messages.length)),button('Добавить вложение',mediaForm)));
  const opts=el('section',null,'spaced');article.append(opts);
  if(n.outcome){
    const end=el('div',null,'endpoint');end.append(el('small',Drafts.endings[n.outcome[0]]),el('h2',n.outcome[1]),el('p',n.note),button('Изменить финал',ending));end.append(button('Продолжить после финала',()=>commit(()=>{delete n.outcome;delete n.note;}),'quiet'));opts.append(end);
  }else{
    const keys=Object.entries(n.choices||{});
    opts.append(withHelp(el('h2',n.question||(step==='start'?'Два продолжения истории':'Что выберет игрок?')),'branches','Продолжения истории',
      step==='start'?'Открой один из вариантов, чтобы прочитать, как разовьётся ситуация. К другому можно вернуться кнопкой «К другим ответам».':'Нажми на ответ, чтобы прочитать его последствия. Чтобы написать ещё одно продолжение, добавь вариант ответа. Если история здесь заканчивается, оформи финал.'));
    const endMode=n.reaction && n.reaction.through===n.messages.at(-1)?'black':n.mode;
    for(const [key,label] of keys){
      const dst=r.scenes[key],box=el('div',null,'choice');
      const open=button(plain(label)+' →',()=>go(key),'open-choice');
      if(step!=='start'){
        const same={white:'белом',yellow:'жёлтом',orange:'оранжевом',red:'красном'};
        const caption=endMode===dst.mode?'Остаться на '+same[dst.mode]:'Перейти на '+Drafts.levels[dst.mode].toLowerCase();
        const badge=el('span',caption,'choice-level');
        badge.id='choice-level-'+key;
        open.setAttribute('aria-describedby',badge.id);
        box.dataset.code=dst.mode;
        box.append(badge);
      }
      box.append(open,el('small',dst.outcome?.[1]||dst.question||plain(words(data.messages[dst.messages[0]]||{}))||'Продолжение ещё не написано.'));
      if(step!=='start')box.append(button('Изменить ответ',()=>branch(key),'quiet'));if(step!=='start') box.append(button('Убрать ветку',()=>{
        const drop=new Set();function visit(id){drop.add(id);Object.keys(r.scenes[id].choices||{}).forEach(visit);}visit(key);
        if(!window.confirm('Убрать вариант и все его продолжения ('+drop.size+' фрагм.)?'))return;
        commit(()=>{
          delete n.choices[key];for(const id of drop)delete r.scenes[id];
          for(const ref of Object.keys(r.cues))if(drop.has(ref.split('/')[0]))delete r.cues[ref];
          for(const node of Object.values(r.scenes))if(node.review && drop.has(node.review.repair)){delete node.review.repair;delete node.review.recovery;}
        });
      },'quiet'));opts.append(box);
    }
    if(step!=='start'){
      const b=actions(button('＋ Добавить вариант ответа',()=>branch()));
      if(!keys.length)b.append(button('Завершить историю здесь',ending));opts.append(b);
    }
  }
  if(path.length>2){
    const rev=el('details',null,'reviewbox');rev.append(el('summary','Что увидит игрок в разборе'));
    if(n.review){
      for(const ref of n.review.signals)rev.append(el('p','«'+Drafts.quote(Drafts.cueWords(data,r,ref))+'» — '+r.cues[ref]));
      rev.append(el('p',n.review.effect));
    }
    rev.append(withHelp(button('Изменить разбор',reviewForm),'review','Разбор выбора','Здесь игрок узнаёт, какую деталь он заметил или пропустил. Отметь фразу в предыдущей реплике, описании вложения или ответе игрока. Затем свяжи её с последствием в «Изменить разбор».'));article.append(rev);
  }
  article.append(actions(button(Drafts.isChecked(d,role,step)?'Снять отметку «Проверено»':'Отметить как проверенное',()=>{
    if(Drafts.isChecked(d,role,step))delete d.checked[role+'/'+step];else d.checked[role+'/'+step]=Drafts.stamp(d.work,role,step);persist();render();
  }),button('Проверить историю',inspect,'quiet')));
}
function mediaForm(){
  const {n,role,step}=current(),data=d.work.data;
  const options=Object.entries(data.messages).filter(([,m])=>m.media);
  form('Добавить вложение',(field,f)=>{
    f.append(el('p','Выбери вложение из истории или файл с устройства до 2 МБ. При добавлении файла весь черновик должен помещаться в 16 МБ.','inline-help'));
    const pick=field('pick','Вложение','new','',[['new','Файл с устройства'],...options.map(([key,m])=>[key,Drafts.mediaName[m.media.kind]+' · '+plain(words(m)).slice(0,60)])]);
    const from=field('speaker','Кто отправляет?','Ты');from.required=true;
    const file=field('file','Выбрать файл','','file');file.accept='image/png,image/jpeg,image/webp,audio/mpeg,audio/ogg';
    const desc=field('desc','Текст голосового или описание','','textarea');const sticker=field('imageKind','Как показать изображение?','image','',[['image','Картинка'],['sticker','Стикер']]);
    const toggle=()=>{for(const c of [file,desc,sticker])c.parentElement.hidden=pick.value!=='new';};
    pick.onchange=toggle;toggle();
  },async v=>{
    if(v.pick!=='new'){
      commit(()=>{const key=Drafts.id('media');data.messages[key]={...clone(data.messages[v.pick]),speaker:v.speaker};n.messages.push(key);});return;
    }
    const file=formBody.querySelector('input[type=file]').files[0];if(!file)throw Error('Выбери файл с устройства.');
    needed(v.desc,'Добавь текст голосового или описание вложения.');
    const types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','audio/mpeg':'mp3','audio/ogg':'ogg'};
    if(!types[file.type]||file.size>2_000_000)throw Error('Подойдёт изображение, MP3, OGG размером до 2 МБ.');
    const draft=d, sourceForm=formBody.querySelector('form');
    const encoded=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(Error('Файл не удалось прочитать.'));
      reader.readAsDataURL(file);
    });
    if(d!==draft || !sheet.open || !sourceForm.isConnected)return;
    const key=Drafts.id('media'),src='./game/media/'+data.id+'/'+key+'.'+types[file.type];
    const media=file.type.startsWith('audio/')?{kind:'voice',src,transcript:v.desc}:{kind:v.imageKind,src,alt:v.desc};
    const candidate={...d,work:clone(d.work),files:{...d.files,[src]:encoded}};
    candidate.work.data.messages[key]={speaker:v.speaker,media};
    candidate.work.data.routes[role].scenes[step].messages.push(key);
    if(new Blob([Drafts.pack(candidate)]).size>attachmentPackageLimit){
      throw Error('С этим файлом черновик превысит 16 МБ. Выбери файл поменьше или убери ненужное вложение.');
    }
    commit(()=>{d.work=candidate.work;d.files=candidate.files;});
  },'Добавить вложение',()=>document.getElementById('edit-message-'+(current().n.messages.length-1))?.focus());
}
syncHash();
