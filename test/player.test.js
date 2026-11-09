'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const player=require('../api/player');
function db(stubs){const calls=[];return {calls,async execute(sql,args){calls.push({sql,args});return [stubs(sql,args)||[]]}};}
test('search by ID uses parameter binding and does not need minimum nickname length',async()=>{
 const pool=db((sql,args)=>args?.[0]===7&&sql.includes('WHERE id=')?[{id:7,name:'Player_One'}]:[]);
 const r=await player.search(pool,{q:'7'});
 assert.equal(r.rows[0].id,7);assert.equal(pool.calls[0].args[0],7);
});
test('nickname search escapes wildcard and SQL input stays in parameter',async()=>{
 const pool=db(()=>[]);await player.search(pool,{q:"a_'%"});
 assert.match(pool.calls[0].sql,/WHERE name LIKE \?/);assert.ok(!pool.calls[0].sql.includes("a_'%"));
 assert.match(pool.calls[0].args[0],/\\_/);
});
test('profile SELECT only exposes approved game fields, never authentication secrets',async()=>{
 const pool=db(sql=>sql.includes('FROM accounts a')?[{id:10,name:'Test_Player',family_name:'Alpha'}]:sql.includes('FROM bank_accounts')?[{id:8,name:'Bonus',balance:100}]:[]);
 const result=await player.profile(pool,{id:'10'});
 assert.equal(result.player.name,'Test_Player');
 assert.equal(result.bankAccounts[0].balance,100);
 assert.ok(!pool.calls.some(({sql})=>/\bINSERT\b|\bUPDATE\b|\bDELETE\b|SELECT \*/i.test(sql)));
 const allSql=pool.calls.map(x=>x.sql).join('\n');
 assert.ok(!/a\.\`(password|salt|email|AdminPass|setting_pin_code|a_secret|reg_ip|last_ip)\`/i.test(allSql));
 assert.ok(!/\`pin\`/.test(allSql));
});
test('pagination whitelist rejects arbitrary tables, bank history joins account owner',async()=>{
 const pool=db(()=>[]);
 const no=await player.rows(pool,{id:'10',kind:'accounts;DROP TABLE accounts'});
 assert.equal(no,undefined);assert.equal(pool.calls.length,0);
 await player.rows(pool,{id:'10',kind:'bank',page:'2'});
 assert.match(pool.calls[0].sql,/JOIN bank_accounts ba ON ba.id=t.acc_id/);
 assert.match(pool.calls[0].sql,/WHERE ba.uid=\?/);
 assert.deepEqual(pool.calls[0].args,[10,21,20]);
});
test('related account results never return IP addresses, only reasoning',async()=>{
 const pool=db(sql=>sql.includes('SELECT reg_ip,last_ip FROM accounts')?[{reg_ip:'203.0.113.12',last_ip:'203.0.113.8'}]:[{id:15,name:'Other_One',level:3,reg_ip:'203.0.113.12',last_ip:'192.0.2.1'}]);
 const r=await player.related(pool,{id:'5'});
 assert.equal(r.rows[0].matchRegistration,true);assert.ok(!JSON.stringify(r).includes('203.0.113.12'));
});
test('source field and table allowlists match SQL dump schema',()=>{
 const filename='/mnt/data/gs325627 (2).sql';if(!fs.existsSync(filename))return;
 const source=fs.readFileSync(filename,'utf8');
 const defs=new Map([...source.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\) ENGINE=/g)].map(x=>[x[1],new Set([...x[2].matchAll(/^\s*`([^`]+)` /gm)].map(c=>c[1]))]));
 const referenced=fs.readFileSync(path.join(__dirname,'../api/player.js'),'utf8');
 assert.ok(defs.get('accounts').size>100);
 for(const f of Object.values(player.profileGroups).flat())assert.ok(defs.get('accounts').has(f),f);
 for(const table of ['accounts','familynew','bank_accounts','money_log','inventory','ownable_cars','bank_accounts_log'])assert.ok(defs.has(table),table);
});
