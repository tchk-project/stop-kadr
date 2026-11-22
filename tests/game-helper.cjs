const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const docs = path.join(__dirname,'../docs');
const read = name => fs.readFileSync(path.join(docs,name),'utf8');
const ctx = vm.createContext({});
vm.runInContext([read('engine.js'),read('attention.js'),read('game/catalog.js')].join('\n'),ctx);
const catalog = vm.runInContext('allStories',ctx);
const modes = vm.runInContext('attentionModes',ctx);
function build(id,role) {
  const data = vm.runInNewContext(read('game/stories/'+id+'.js')+'\nstoryData');
  return ctx.prepareRoute(data,role);
}
module.exports = {build,catalog,ctx,modes,docs,read};
