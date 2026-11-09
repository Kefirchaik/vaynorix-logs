'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readOverview,integer}=require('../api/overview');
test('balances, online count and read-only SQL',async()=>{
 const records=[{account_count:'274',online_flags:'21',cash:'9007199254740993',main_bank:'200'},{amount:'400'},{amount:'700'},{amount:'900'},{amount:'300'}];
 const queries=[];
 const result=await readOverview({async execute(sql){queries.push(sql);return [[records[queries.length-1]]];}});
 assert.equal(result.accounts,'274');
 assert.equal(result.online,'21');
 assert.equal(result.totalMoney,(9007199254740993n+200n+400n+700n+900n+300n).toString());
 assert.equal(result.breakdown.length,6);
 assert.ok(queries.every(q=>q.startsWith('SELECT ')));
 assert.ok(queries.every(q=>!q.includes('money_log')));
});
test('empty balances and numeric validation',async()=>{
 const records=[{account_count:0,online_flags:0,cash:null,main_bank:null},{amount:null},{amount:null},{amount:null},{amount:null}];
 let i=0;
 const result=await readOverview({async execute(){return [[records[i++]]];}});
 assert.equal(result.totalMoney,'0');
 assert.equal(integer('1.000'),1n);
 assert.throws(()=>integer('1e12'));
});
