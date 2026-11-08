'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {analyze,riskOverview}=require('../api/antifraud');
const now=Date.UTC(2026,10,8,22,0,0),sec=Math.floor(now/1000);
const accounts=[
 {id:1,name:'MainOne',money:25000000,reg_ip:'1.2.3.4',last_ip:'5.6.7.8'},
 {id:2,name:'AltOne',money:200,reg_ip:'1.2.3.4',last_ip:'5.6.7.8'},
 {id:3,name:'Neutral',money:0,reg_ip:'255.255.255.255',last_ip:''},
 {id:4,name:'NeutralTwo',money:0,reg_ip:'255.255.255.255',last_ip:''},
 {id:5,name:'Other',money:1,reg_ip:'8.8.8.8',last_ip:'9.9.9.9'},
];
const rows=[
 {id:11,uid:1,time:sec-61,money:-1500000,description:'None'},
 {id:12,uid:2,time:sec-40,money:1500000,description:'None'},
 {id:13,uid:3,time:sec-100,money:2000000,description:'BlackPass task reward'},
 {id:14,uid:1,time:sec-300,money:2000000,description:'None'},
 {id:15,uid:1,time:sec-350,money:2000000,description:'None'},
 {id:16,uid:1,time:sec-400,money:2000000,description:'None'},
 {id:17,uid:2,time:sec-86400*40,money:9000000,description:'old'},
];
test('flags shared IP without revealing raw addresses or treating placeholder IP as evidence',()=>{
 const r=analyze(accounts,rows,{now,minimum:1000000,days:7});
 assert.ok(r.cases.some(c=>c.type==='possible_multi_registration'&&c.players.some(p=>p.id===2)));
 assert.ok(!r.cases.some(c=>c.type==='possible_multi_registration'&&c.players.some(p=>p.id===3)));
 assert.ok(!JSON.stringify(r).includes('1.2.3.4'));
});
test('flags matching opposite signs only when accounts share network and time',()=>{
 const r=analyze(accounts,rows,{now,minimum:1000000,days:7});
 assert.ok(r.cases.some(c=>c.type==='possible_related_flow'&&c.relatedLogId===11&&c.logId===12));
 assert.ok(r.cases.some(c=>c.type==='repeated_credit'));
 assert.ok(!r.cases.some(c=>c.logId===17));
});
test('does not infer transfer from unrelated accounts, ignores bank/casino rows',()=>{
 const r=analyze(accounts,[{id:1,uid:1,money:-2000000,time:sec-30,description:'[BANK] deposit'},{id:2,uid:5,money:2000000,time:sec-29,description:'None'}],{now,days:7});
 assert.ok(!r.cases.some(c=>c.type==='possible_related_flow'));
});
test('returns bounded read-only responses from real SQL entrypoint',async()=>{
 const calls=[];
 const fake={execute:async(sql)=>{calls.push(sql);return [sql.includes('money_log')?rows:accounts]}};
 const result=await riskOverview(fake,{days:'7',minimum:'1000000'});
 assert.ok(result.summary.total>=1);
 assert.equal(calls.length,2);
 assert.ok(calls.every(sql=>sql.startsWith('SELECT ')));
});