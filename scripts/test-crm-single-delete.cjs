const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let calls = [], response = {data:{id:'one'},error:null};
const client = {from(table){calls.push(['table',table]);return {
 delete(){calls.push(['delete']);return this;},
 eq(key,value){calls.push(['eq',key,value]);return this;},
 select(fields){calls.push(['select',fields]);return this;},
 async single(){return response;},
};}};
const moduleStub={exports:{}};
const source=ts.transpileModule(fs.readFileSync('services/crm/vendorService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module:moduleStub,exports:moduleStub.exports,console,require(name){
 if(name==='@/services/supabase')return {supabase:client};
 if(name==='@/services/crm/errors')return {crmError: reason=>new Error(reason.message)};
 return {};
}});
(async()=>{
 const service=moduleStub.exports.CrmVendorService;
 await service.remove('one');
 assert.deepEqual(calls,[['table','crm_vendors'],['delete'],['eq','id','one'],['select','id']]);
 calls=[];await assert.rejects(()=>service.remove(''),/ID is required/);assert.deepEqual(calls,[]);
 response={data:null,error:{message:'Not allowed'}};await assert.rejects(()=>service.remove('one'),/Not allowed/);
 response={data:null,error:null};await assert.rejects(()=>service.remove('one'),/was not deleted/);
 console.log('PASS: single CRM deletion scopes one ID, blocks empty IDs, and reports denied/missing rows.');
})().catch(error=>{console.error(error);process.exitCode=1;});
