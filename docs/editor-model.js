'use strict';
const Drafts = (() => {
  const roles = ['witness','self'];
  const format = 'stop-kadr-draft/1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => prefix+'-'+crypto.randomUUID();
  const mark = /\[\[([^\[\]]+)\]\]/;
  const plain = text => (text || '').replace(mark,'$1');
  const quote = text => mark.exec(text)?.[1] || '';
  const words = m => m.text ?? m.media?.transcript ?? m.media?.caption ?? m.media?.alt ?? '';
  const emptyFile = value => value==='data:' || value==='data:,' || (typeof value==='string' &&
    /^data:(?:image\/(?:png|jpeg|webp)|audio\/(?:mpeg|ogg)|application\/octet-stream)?;base64,$/.test(value));
  const mediaName = {voice:'Голосовое',sticker:'Стикер',image:'Изображение',video:'Видео',document:'Документ'};
  const mediaLabel = media => media.kind==='voice' && media.live ? 'Реплика в голосовом канале' : mediaName[media.kind];
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
  function cueWords(data, route, ref) {
    const [step,key]=ref.split('/');
    if(key!=='@choice')return words(data.messages[key] || {});
    const parent=pathTo(route,step).at(-2);
    return route.scenes[parent]?.choices?.[step] || '';
  }
  function markText(text, phrase) {
    if(text.includes('[[') || text.includes(']]'))throw Error('Для выделения фразы используй отдельное поле.');
    if(!phrase)return text;
    if(!text.includes(phrase))throw Error('Указанной фразы нет в новом тексте. Выбери фразу из текста выше.');
    if(/[\[\]]/.test(phrase))throw Error('Выбери фразу без квадратных скобок.');
    return text.replace(phrase,()=> '[['+phrase+']]');
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
  // A review mark needs to detect changes without keeping a copy of the author's text.
  function fingerprint(text) {
    let left=2166136261, right=5381;
    for(let i=0;i<text.length;i++){
      const code=text.charCodeAt(i);
      left=Math.imul(left^code,16777619);
      right=Math.imul(right,33)^code;
    }
    return 'v1-'+(left>>>0).toString(16).padStart(8,'0')+(right>>>0).toString(16).padStart(8,'0');
  }
  function stamp(work,role,step) {
    const {data,meta}=work, route=data.routes[role];
    return fingerprint(JSON.stringify([meta.title,meta.roles[role],...pathTo(route,step).map(key=>{
      const n=route.scenes[key];
      return [n,n.messages.map(id=>[data.messages[id],data.channels[data.messages[id]?.channel],route.cues[key+'/'+id]]),
        route.cues[key+'/@choice']];
    })]));
  }
  function isChecked(d,role,step) {const saved=d.checked[role+'/'+step];return Boolean(saved && saved===stamp(d.work,role,step));}
  function issues(work,files) {
    const errors=[];
    const {data,meta}=work;
    if(!meta.title?.trim() || !meta.place?.trim()) errors.push({message:'Укажи название и место действия.',meta:true});
    for(const role of roles){
      const route=data.routes[role];
      if(Object.values(meta.roles[role]).some(s=>!s.trim()))errors.push({role,meta:true,message:'Заполни имя героя, форму имени и вступление.'});
      for(const [step,n] of Object.entries(route.scenes)){
        const add=(message,where)=>errors.push({role,step,message,...where});
        function checkMark(text,ref,where) {
          const reason=route.cues[ref], linked=Object.hasOwn(route.cues,ref);
          const rest=text.replace(mark,'');
          if(rest.includes('[[') || rest.includes(']]') || (linked && !quote(text).trim())){
            add(where.choice?'Снова выдели фразу для разбора в ответе «'+plain(text)+'».':
              'Снова выдели фразу для разбора в реплике «'+plain(text)+'».',where);
          }else if(linked && (typeof reason!=='string' || !reason.trim())){
            add('Заполни пояснение к фразе «'+quote(text)+'».',where);
          }
        }
        if(!n.messages.length)add('Добавь первую реплику.');
        const choices=Object.values(n.choices || {});
        if(!choices.length && !n.outcome)add('Здесь история обрывается. Добавь ответ игрока или финал.');
        if(choices.length && step!=='start' && !n.question?.trim())add('Напиши вопрос перед вариантами ответа.');
        for(const [target,label] of Object.entries(n.choices || {})){
          if(!label.trim())add('Подпиши вариант ответа.',{choice:target});
          checkMark(label,target+'/@choice',{choice:target});
        }
        if(n.outcome && (!n.outcome[1]?.trim() || !n.note?.trim()))add('Заполни заголовок финала и пояснение.');
        if(n.review && (!n.review.effect?.trim() || !n.review.signals.length))add('Выбери деталь для разбора и напиши пояснение.');
        if(n.review){
          const previous=pathTo(route,step).slice(0,-1);
          if(n.review.signals.some(ref=>!previous.includes(ref.split('/')[0])))add('Выбери для разбора фразу, которую игрок уже встретил на этом пути.');
        }
        for(const k of n.messages){
          const m=data.messages[k];
          if(m.media && emptyFile(files?.[m.media.src]))add('Замени пустой файл у вложения «'+plain(words(m))+'».',{file:m.media.src});
          if(!m.speaker.trim() || !words(m).trim())add('Заполни автора и текст реплики или описание вложения.',{line:k});
          checkMark(words(m),step+'/'+k,{line:k});
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
  function pruneUnused(d) {
    const {data}=d.work, used=new Set(), checked={};
    for(const role of roles) for(const [step,scene] of Object.entries(data.routes[role].scenes)){
      for(const key of scene.messages)used.add(key);
      const ref=role+'/'+step, saved=d.checked?.[ref];
      if(typeof saved==='string'){
        if(saved.startsWith('['))checked[ref]=fingerprint(saved); // Original v1 packages stored the entire scene.
        else if(/^v1-[a-f0-9]{16}$/.test(saved))checked[ref]=saved;
      }
    }
    d.checked=checked;
    for(const key of Object.keys(data.messages)){
      if(used.has(key))continue;
      if(d.base && Object.hasOwn(d.base.data.messages,key))data.messages[key]=clone(d.base.data.messages[key]);
      else delete data.messages[key];
    }
    if(!d.files)return;
    const files={};
    for(const work of [d.work,d.base]){
      if(!work)continue;
      for(const {media} of Object.values(work.data.messages)){
        if(!media)continue;
        for(const prop of ['src','file','poster','html','captions']){
          const path=media[prop];
          if(Object.hasOwn(d.files,path))files[path]=d.files[path];
        }
      }
    }
    if(Object.keys(files).length)d.files=files;
    else delete d.files;
  }
  function pack(source){
    const data={...source.work.data,messages:{...source.work.data.messages}};
    const d={...source,work:{...source.work,data}};
    pruneUnused(d);
    const {format,base,work,checked,view,files}=d;
    return JSON.stringify({format,base,work,checked,view,files},null,2);
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
             typeof blob!=='string'||(!emptyFile(blob) && !/^data:(image\/(png|jpeg|webp)|audio\/(mpeg|ogg));base64,[A-Za-z0-9+/]+=*$/.test(blob)))throw Error();
          d.files[path]=blob;
        }
      }
      if(f.checked && typeof f.checked==='object')d.checked=f.checked;
      if(roles.includes(f.view?.role)&&Object.hasOwn(d.work.data.routes[f.view.role].scenes,f.view.step))d.view=f.view;
      pruneUnused(d);return d;
    }catch{throw Error('Этот файл не удалось открыть. Выбери файл черновика «Стоп-кадра».');}
  }
  return {roles,format,clone,id,plain,quote,words,cueWords,markText,mediaName,mediaLabel,levels,endings,blank,draft,pathTo,uses,detach,stamp,isChecked,issues,verifyWork,pruneUnused,pack,unpack,emptyFile};
})();
