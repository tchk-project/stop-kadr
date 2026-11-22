'use strict';
const Drafts = (() => {
  const roles = ['witness','self'];
  const format = 'stop-kadr-draft/1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => prefix+'-'+crypto.randomUUID();
  const plain = text => (text || '').replace(/\[\[([^\]]+)\]\]/g,'$1');
  const words = m => m.text ?? m.media?.transcript ?? m.media?.caption ?? m.media?.alt ?? '';
  const mediaName = {voice:'Голосовое',sticker:'Стикер',image:'Изображение',video:'Видео',document:'Документ'};
  const levels = {white:'Белый',yellow:'Жёлтый',orange:'Оранжевый',red:'Красный'};
  const endings = {positive:'Удачный исход',mixed:'Смешанный исход',negative:'Неудачный исход',open:'Открытый финал'};

  function blank(title, witness, self) {
    const roles = {};
    for (const [role,name] of Object.entries({witness,self})) roles[role]={name,viewpoint:name,intro:''};
    const route = {scenes:{
      start:{mode:'yellow',messages:[],choices:{pressure:'С давлением',calm:'Спокойный вариант'}},
      pressure:{mode:'yellow',continuation:true,messages:[]},
      calm:{mode:'yellow',continuation:true,messages:[]}
    },cues:{}};
    const storyId=id('story');
    return {meta:{id:storyId,title,place:'',roles},data:{id:storyId,channels:{},messages:{},routes:{self:clone(route),witness:clone(route)}}};
  }
  function draft(source, base) {
    return {format,key:id('draft'),base:base ? clone(base):null,work:clone(source),checked:{},view:{role:'self',step:'start'},revision:0};
  }
  function pathTo(route, step) {
    const parents=new Map();
    for (const [key,n] of Object.entries(route.scenes)) for (const t of Object.keys(n.choices || {})) parents.set(t,key);
    const path=[], seen=new Set();
    while (step && !seen.has(step)) { path.push(step);seen.add(step);step=parents.get(step); }
    return path.reverse();
  }
  function uses(data, key) {
    const found=[];
    for(const role of roles) for(const [step,n] of Object.entries(data.routes[role].scenes)) {
      if(n.messages.includes(key)) found.push({role,step});
    }
    return found;
  }
  function detach(data, role, step, key) {
    const route=data.routes[role], node=route.scenes[step], fresh=id('line');
    data.messages[fresh]=clone(data.messages[key]);
    node.messages[node.messages.indexOf(key)]=fresh;
    const oldRef=step+'/'+key, ref=step+'/'+fresh;
    if(Object.hasOwn(route.cues,oldRef)){route.cues[ref]=route.cues[oldRef];delete route.cues[oldRef];}
    for(const n of Object.values(route.scenes)) {
      if(n.review) n.review.signals=n.review.signals.map(s=>s===oldRef?ref:s);
    }
    if(node.reaction) for(const prop of ['from','through']) if(node.reaction[prop]===key)node.reaction[prop]=fresh;
    return fresh;
  }
  function stamp(work,role,step) {
    const {data,meta}=work, route=data.routes[role];
    return JSON.stringify([meta.title,meta.roles[role],...pathTo(route,step).map(key=>{
      const n=route.scenes[key];
      return [n,n.messages.map(id=>[data.messages[id],data.channels[data.messages[id]?.channel],route.cues[key+'/'+id]]),
        route.cues[key+'/@choice']];
    })]);
  }
  function isChecked(d,role,step) {return d.checked[role+'/'+step]===stamp(d.work,role,step);}
  function issues(work) {
    const errors=[];
    const {data,meta}=work;
    if(!meta.title?.trim() || !meta.place?.trim()) errors.push({message:'Укажи название и место действия.',meta:true});
    for(const role of roles){
      const route=data.routes[role];
      if(Object.values(meta.roles[role]).some(s=>!s.trim()))errors.push({role,meta:true,message:'Заполни имя героя, форму имени и вступление.'});
      for(const [step,n] of Object.entries(route.scenes)){
        const add=message=>errors.push({role,step,message});
        if(!n.messages.length)add('Добавь первую реплику.');
        const choices=Object.values(n.choices || {});
        if(!choices.length && !n.outcome)add('Здесь история обрывается. Добавь ответ игрока или финал.');
        if(choices.length && step!=='start' && !n.question?.trim())add('Напиши вопрос перед вариантами ответа.');
        if(choices.some(s=>!s.trim()))add('Подпиши все варианты ответа.');
        if(n.outcome && (!n.outcome[1]?.trim() || !n.note?.trim()))add('Заполни заголовок финала и пояснение.');
        if(n.review && (!n.review.effect?.trim() || !n.review.signals.length))add('Выбери деталь для разбора и напиши пояснение.');
        for(const k of n.messages){
          const m=data.messages[k];
          if(!m?.speaker || (!m.media && !m.text?.trim()))add('У реплики отсутствует автор или текст.');
          if(route.cues[step+'/'+k] && !/\[\[.+?\]\]/s.test(words(m)))add('Снова выдели фразу для разбора в изменённой реплике.');
        }
      }
    }
    return errors;
  }

  // Imported drafts are data only. Check references before using them in the player.
  function verifyWork(work) {
    const {meta,data}=work;
    const validId=s=>typeof s==='string' && /^[a-z0-9][a-z0-9-]*$/.test(s) && !(s in Object.prototype);
    if(!validId(meta.id)||meta.id!==data.id||typeof meta.title!=='string'||typeof meta.place!=='string')throw Error();
    if(meta.article && !/^\.\/[a-z-]+\.html$/.test(meta.article))throw Error();
    for(const [key,ch] of Object.entries(data.channels)){
      if(!validId(key)||!['group','private','scene','voice'].includes(ch.kind)||typeof ch.title!=='string')throw Error();
    }
    for(const [key,m] of Object.entries(data.messages)){
      if(!validId(key)||typeof m.speaker!=='string'||(m.channel && !Object.hasOwn(data.channels,m.channel)))throw Error();
      if(m.media){
        if(!Object.hasOwn(mediaName,m.media.kind))throw Error();
        for(const k of ['src','file','poster','html','captions']) if(m.media[k] && !/^\.\/(?:assets|game\/media)\/(?:[a-zA-Z0-9_-]+\/)*[\w.-]+\.[a-zA-Z0-9]+$/.test(m.media[k]))throw Error();
        if(!m.media.src || typeof words(m)!=='string')throw Error();
      }else if(typeof m.text!=='string')throw Error();
    }
    for(const role of roles){
      const actor=meta.roles[role];
      if(['name','viewpoint','intro'].some(k=>typeof actor[k]!=='string'))throw Error();
      const r=data.routes[role],seen=new Set();
      if(!r.cues||!r.scenes.start||!r.scenes.calm||!r.scenes.pressure)throw Error();
      const visit=step=>{
        if(!validId(step)||!Object.hasOwn(r.scenes,step)||seen.has(step))throw Error();
        seen.add(step);
        const n=r.scenes[step];
        if(!Object.hasOwn(levels,n.mode)||!Array.isArray(n.messages)||n.messages.some(k=>!Object.hasOwn(data.messages,k)))throw Error();
        if(n.outcome && (!Array.isArray(n.outcome)||!Object.hasOwn(endings,n.outcome[0])))throw Error();
        if(n.review && (!Array.isArray(n.review.signals)||n.review.signals.some(k=>!Object.hasOwn(r.cues,k))))throw Error();
        for(const [t,label] of Object.entries(n.choices || {})){if(typeof label!=='string')throw Error();visit(t);}
      };
      visit('start');if(seen.size!==Object.keys(r.scenes).length)throw Error();
    }
    return work;
  }
  function unpack(raw) {
    try {
      const f=JSON.parse(raw,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error();return v});
      if(f.format!==format)throw Error();
      verifyWork(f.work);if(f.base){verifyWork(f.base);if(f.base.meta.id!==f.work.meta.id)throw Error();}
      const d=draft(f.work,f.base);
      if(f.files){
        d.files={};
        for(const [path,blob] of Object.entries(f.files)){
          if(!/^\.\/game\/media\/[a-z0-9-]+\/[a-z0-9-]+\.(png|jpg|webp|mp3|ogg)$/.test(path) ||
             typeof blob!=='string'||!/^data:(image\/(png|jpeg|webp)|audio\/(mpeg|ogg));base64,[A-Za-z0-9+/]+=*$/.test(blob))throw Error();
          d.files[path]=blob;
        }
      }
      if(f.checked && typeof f.checked==='object')d.checked=f.checked;
      if(roles.includes(f.view?.role)&&Object.hasOwn(d.work.data.routes[f.view.role].scenes,f.view.step))d.view=f.view;
      return d;
    }catch{throw Error('Этот файл не удалось открыть. Выбери файл черновика «Стоп-кадра».');}
  }
  return {roles,format,clone,id,plain,words,mediaName,levels,endings,blank,draft,pathTo,uses,detach,stamp,isChecked,issues,verifyWork,unpack};
})();
