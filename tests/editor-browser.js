'use strict';
const frame=document.querySelector('iframe'),log=document.querySelector('#result');
const doc=()=>frame.contentDocument;
const wait=async(fn,label)=>{for(let i=0;i<350;i++){const result=fn();if(result)return result;await new Promise(r=>setTimeout(r,35));}throw Error(label);};
const click=(label,root=doc())=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent===label);if(!b)throw Error('Кнопка '+label);b.click();};
const field=label=>[...doc().querySelectorAll('dialog[open] label')].find(l=>l.firstChild?.textContent===label)?.querySelector('input,textarea,select');
function check(ok,text){if(!ok)throw Error(text);log.textContent+=text+'\n';}
async function run(){
 frame.src='../docs/editor.html';
 const name='Кот под голосовым';
 const entry=await wait(()=>[...doc().querySelectorAll('button.storycard')].find(b=>b.querySelector('strong')?.textContent===name),'Каталог');entry.click();
 await wait(()=>doc().querySelector('.rail'),'Открытие черновика');
 const original=await (await fetch('../docs/game/stories/sticker.js')).text();
 click('Читать дальше →');await wait(()=>doc().querySelector('.scenehead')?.textContent.includes('давлением'),'Ветка');
 const privateChat=doc().querySelector('.group.private');
 check(!!privateChat,'Личная переписка отделена от общего чата');
 click('Изменить реплику',privateChat);
 const body=field('Реплика');const replacement=body.value+' Медиа для вычитки.';body.value=replacement;
 click('Сохранить',doc().querySelector('#sheet'));
 check(doc().querySelector('article').textContent.includes(replacement),'Текст изменён в черновике');
 click('Отметить как проверенное');check(!![...doc().querySelectorAll('button')].find(b=>b.textContent==='Снять отметку «Проверено»'),'Явная отметка вычитки');
 const reloaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
 frame.contentWindow.location.reload();await reloaded;await wait(()=>doc().querySelector('article')?.textContent.includes(replacement),'Восстановление');
 check(doc().querySelector('.scenehead').textContent.includes('давлением'),'После перезагрузки открыты прежняя ветка и роль');
 click('＋ Добавить вариант ответа');field('Что выберет игрок?').value='Напишу Вере после уроков';click('Сохранить',doc().querySelector('#sheet'));
 click('＋ Добавить реплику');field('Реплика').value='Вер, увидимся у школы.';click('Сохранить',doc().querySelector('#sheet'));
 click('Завершить историю здесь');field('Что произошло?').value='Договорились о встрече';field('Что объяснить игроку?').value='Лера выбрала время разговора.';click('Сохранить',doc().querySelector('#sheet'));
 click('Проверить в игре');const game=()=>doc().querySelector('#preview iframe').contentDocument;
 await wait(()=>game()?.querySelector('#outcome-title')?.textContent==='Договорились о встрече','Предпросмотр нового финала');
 check(game().querySelector('#messages').textContent.includes('Вер, увидимся'),'Новая ветка проигрывается настоящим движком');
 click('Вернуться к тексту',doc().querySelector('#preview header'));
 check(doc().querySelector('.scenehead').textContent.includes('Напишу Вере'),'Возврат к месту правки');
 check((await (await fetch('../docs/game/stories/sticker.js')).text())===original,'Опубликованная история осталась исходной');
 const w=frame.contentWindow, oldClick=w.HTMLAnchorElement.prototype.click;
 let blob;
 try {
   w.HTMLAnchorElement.prototype.click=function(){blob=w.fetch(this.href).then(response=>response.text());};
   click('Скачать для передачи');
 } finally {w.HTMLAnchorElement.prototype.click=oldClick;}
 const exported=await blob;
 check(JSON.parse(exported).base.meta.id==='sticker','Файл содержит исходную версию истории');
 click('← Все истории');
 const fileInput=doc().querySelector('#import-file'), transfer=new w.DataTransfer();
 transfer.items.add(new w.File([exported],'проверка.stop-kadr.json',{type:'application/json'}));
 fileInput.files=transfer.files;fileInput.dispatchEvent(new w.Event('change'));
 await wait(()=>doc().querySelector('.scenehead')?.textContent.includes('Напишу Вере'),'Импорт файла');
 check(doc().querySelector('article').textContent.includes('Договорились о встрече'),'Импорт сохранил выбор, финал и место чтения');
 click('← Все истории');click('Написать историю');field('Как называется история?').value='Проверка пустого листа';click('Начать писать',doc().querySelector('#sheet'));
 click('＋ Добавить реплику');field('Реплика').value='Кто взял краски?';click('Сохранить',doc().querySelector('#sheet'));
 check(doc().querySelector('article').textContent.includes('Кто взял краски?'),'Новая история сохранена с первой реплики');
 frame.style.width='350px';check(doc().documentElement.scrollWidth<=doc().documentElement.clientWidth,'Редактор помещается на мобильном экране');
}
document.querySelector('#run').onclick=async function(){this.disabled=true;try{await run();log.dataset.result='ok';}catch(e){log.textContent+=e.stack;log.dataset.result='error';}finally{this.disabled=false;}};
