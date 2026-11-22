const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const docs=path.join(__dirname,'../docs');
const source=file=>fs.readFileSync(path.join(docs,file),'utf8');
const model=vm.runInNewContext(source('editor-model.js')+'\nDrafts',{crypto});
const catalog=vm.runInNewContext(source('game/catalog.js')+'\nallStories');
function work(meta){return {meta,data:vm.runInNewContext(source('game/stories/'+meta.id+'.js')+'\nstoryData')};}

test('all published stories can be exported/imported without changing either role, cues or media',()=>{
 for(const meta of catalog){
  const original=work(meta), d=model.draft(original,original);
  const exported=model.unpack(JSON.stringify(d));
  assert.equal(JSON.stringify(exported.work),JSON.stringify(original),meta.id);
  assert.equal(model.issues(d.work).length,0,meta.id);
  assert.notEqual(exported.key,d.key);
 }
});

test('editing only one occurrence updates its cue links and leaves the shared original intact',()=>{
 const d=model.draft(work(catalog.find(x=>x.id==='sticker')),null);
 const {data}=d.work;
 const [key]=Object.keys(data.messages).filter(k=>model.uses(data,k).length>1);
 const [use,other]=model.uses(data,key);
 const before=JSON.stringify(data.messages[key]);
 const fresh=model.detach(data,use.role,use.step,key);
 data.messages[fresh].text='Правка';
 assert.equal(JSON.stringify(data.messages[key]),before);
 assert.ok(data.routes[other.role].scenes[other.step].messages.includes(key));
 assert.ok(data.routes[use.role].scenes[use.step].messages.includes(fresh));
});

test('a branch becomes unchecked when an earlier shared message changes; drafts do not change their baseline',()=>{
 const source=work(catalog[0]), d=model.draft(source,source);
 d.checked['self/pressure']=model.stamp(d.work,'self','pressure');
 assert.equal(model.isChecked(d,'self','pressure'),true);
 d.work.data.messages[d.work.data.routes.self.scenes.start.messages[0]].speaker='Редактор';
 assert.equal(model.isChecked(d,'self','pressure'),false);
 assert.equal(JSON.stringify(d.base),JSON.stringify(source));
});
test('unfinished story can be reopened; malformed files and external media links are rejected',()=>{
 const d=model.draft(model.blank('Тест','Вера','Лера'),null);
 assert.ok(model.issues(d.work).length);
 assert.equal(model.unpack(JSON.stringify(d)).work.meta.title,'Тест');
 assert.throws(()=>model.unpack('{"format":"other"}'));
 d.work.data.messages.m={speaker:'Ты',media:{kind:'voice',src:'https://invalid.example/x',transcript:'x'}};
 assert.throws(()=>model.unpack(JSON.stringify(d)));
});
