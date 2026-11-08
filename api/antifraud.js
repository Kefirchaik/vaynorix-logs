'use strict';
// Read-only, bounded heuristics. No confirmation of guilt and no access to credentials.
// The legacy money_log has NO recipient_account_id. A matching debit/credit is a hypothesis,
// never a proven transfer. Network sharing is likewise not proof of multi-account abuse.
const MONEY_SAMPLE = 1800;
const ACCOUNT_SAMPLE = 2500;
const AMOUNTS = new Set([100000, 500000, 1000000, 5000000, 10000000]);
let cached = null;
function goodIP(s) {
 const value = String(s || '').trim();
 if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || ['0.0.0.0','127.0.0.1','255.255.255.255'].includes(value)) return null;
 if (value.split('.').some(x=>Number(x)>255)) return null;
 return value;
}
const onlyMoney = n=>Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0;
function analyze(accounts, moneyRows, {days=7, minimum=1000000, now=Date.now()}={}) {
 const since=Math.floor(now/1000)-days*86400;
 const recent=moneyRows.filter(x=>Number(x.time)>=since && Number(x.time)<=Math.floor(now/1000)+300)
  .map(x=>({id:Number(x.id),uid:Number(x.uid),money:onlyMoney(x.money),time:Number(x.time),description:String(x.description||'')}))
  .filter(x=>Number.isSafeInteger(x.uid)&&x.uid>0);
 const accountById=new Map(accounts.map(a=>[Number(a.id), {id:Number(a.id),name:String(a.name||`#${a.id}`),money:onlyMoney(a.money),reg:goodIP(a.reg_ip),last:goodIP(a.last_ip)}]));
 const who=id=>({id,name:accountById.get(id)?.name||`#${id}`});
 const link=(a,b)=>a&&b&&(a.reg&&a.reg===b.reg||a.reg&&a.reg===b.last||a.last&&a.last===b.reg||a.last&&a.last===b.last);
 const byAmount=new Map();const positivesById=new Map();
 const result=[];
 const add=(type,severity,title,reason,players=[],options={})=>result.push({id:`case-${result.length+1}`,type,severity,title,reason,players, ...options});
 const positive=recent.filter(x=>x.money>0);
 for(const x of positive){const arr=positivesById.get(x.uid)||[];arr.push(x);positivesById.set(x.uid,arr);}
 // IP groups: compare registration / last-login IP separately. Never return an actual IP.
 for(const [kind,field,title] of [['registration','reg','Совпадает IP регистрации'],['last','last','Совпадает последний IP']]){
  const grouped=new Map();
  for(const a of accountById.values()){
   if(!a[field])continue;
   const peers=grouped.get(a[field])||[];peers.push(a);grouped.set(a[field],peers);
  }
  const clusters=[...grouped.values()].filter(g=>g.length>=2)
   .sort((a,b)=>b.length-a.length||a[0].id-b[0].id).slice(0,12);
  for(const members of clusters){
   const list=members.slice(0,12).map(a=>who(a.id));
   add(kind==='registration'?'possible_multi_registration':'possible_multi_last','info',title,
    `Одинаковый ${kind==='registration'?'IP при регистрации':'последний IP'} у ${members.length} аккаунтов. Это может быть семья, VPN или общая сеть; мультиаккаунт не доказан.`,list,{count:members.length});
  }
 }
 // Large positive movements are NOT necessarily a player-to-player transfer.
 for(const x of positive.filter(x=>x.money>=minimum).sort((a,b)=>b.money-a.money).slice(0,18)){
  add('large_credit',x.money>=minimum*5?'high':'medium','Крупное начисление',
    `В money_log зафиксировано начисление ${x.money.toLocaleString('ru-RU')} ₽. Источник средств по этому полю не подтверждён.`,
    [who(x.uid)],{amount:x.money,time:x.time,logId:x.id,description:x.description.slice(0,100)});
 }
 for(const [uid,arr] of positivesById){
  const large=arr.filter(x=>x.money>=minimum);
  if(large.length<3)continue;
  const sum=large.reduce((s,x)=>s+x.money,0);
  if(sum<minimum*5)continue;
  add('repeated_credit','high','Серия крупных начислений',
   `${large.length} крупных зачислений за выбранный период на сумму ${sum.toLocaleString('ru-RU')} ₽. Проверь журнал и назначение платежей.`,
   [who(uid)],{amount:sum,count:large.length,time:Math.max(...large.map(x=>x.time))});
 }
 // A weak, explicitly labelled coincidence: same amount, opposite signs, close time,
 // two accounts which share a network identifier. Never imply proven recipient identity.
 const ignored=/(?:\bbank\b|\bcontainer\b|\bauction\b|\bblackpass\b|\bcasino\b|аренда|покупка|ставка|возврат|выдача по квесту)/i;
 const debits=recent.filter(x=>x.money<=-minimum&&!ignored.test(x.description)).sort((a,b)=>a.time-b.time);
 const credits=positive.filter(x=>x.money>=minimum&&!ignored.test(x.description)).sort((a,b)=>a.time-b.time);
 for(const x of debits){const amount=Math.abs(x.money);const list=byAmount.get(amount)||[];list.push(x);byAmount.set(amount,list);}
 const pairedIds=new Set();let matched=0;
 for(const credit of credits){
  if(matched>=12)break;
  const candidates=byAmount.get(credit.money)||[];
  const debit=candidates.find(x=>x.uid!==credit.uid&&!pairedIds.has(x.id)&&Math.abs(x.time-credit.time)<=180&&link(accountById.get(x.uid),accountById.get(credit.uid)));
  if(!debit)continue;
  pairedIds.add(debit.id);matched++;
  add('possible_related_flow','high','Возможная передача между связанными аккаунтами',
   `Списание и зачисление по ${credit.money.toLocaleString('ru-RU')} ₽ с разницей до 3 минут; аккаунты используют совпадающий IP. Получатель в money_log не записан — это совпадение, а не доказательство перевода.`,
   [who(debit.uid),who(credit.uid)],{amount:credit.money,time:credit.time,logId:credit.id,relatedLogId:debit.id});
 }
 for(const a of accountById.values()){
  if(a.money>=minimum*20)add('large_balance','medium','Крупный текущий баланс',
    `На аккаунте сейчас ${a.money.toLocaleString('ru-RU')} ₽. Сам баланс не указывает на нарушение: проверь историю начислений.`,[who(a.id)],{amount:a.money});
 }
 const priority={high:0,medium:1,info:2};
 result.sort((a,b)=>priority[a.severity]-priority[b.severity]||(b.time||0)-(a.time||0)||(b.amount||0)-(a.amount||0));
 return {
  cases:result.slice(0,75),
  summary:{high:result.filter(x=>x.severity==='high').length,medium:result.filter(x=>x.severity==='medium').length,possibleMulti:result.filter(x=>x.type.startsWith('possible_multi')).length,total:result.length},
  coverage:{moneySample:moneyRows.length,accountSample:accounts.length,from:since,days,minimum},
  disclaimer:'Это автоматические сигналы, а не подтверждение нарушения. Общий IP может принадлежать членам семьи, VPN или мобильной сети; совпадения операций не доказывают перевод. Анализ ограничен последними записями, поэтому отсутствие метки не означает отсутствие риска.'
 };
}
async function riskOverview(pool,params={}){
 const days=[7,30].includes(Number(params.days))?Number(params.days):7;
 const minimum=AMOUNTS.has(Number(params.minimum))?Number(params.minimum):1000000;
 const cacheKey=`${days}:${minimum}`;
 if(cached&&cached.key===cacheKey&&Date.now()-cached.at<20000)return cached.data;
 // Explicit bounds protect the game DB from unbounded scans.
 const [logs]=await pool.execute('SELECT id,uid,money,description,time FROM `money_log` ORDER BY id DESC LIMIT 1801');
 const [accounts]=await pool.execute('SELECT id,name,money,reg_ip,last_ip FROM `accounts` ORDER BY id DESC LIMIT 2501');
 const limitedLogs=logs.slice(0,MONEY_SAMPLE),limitedAccounts=accounts.slice(0,ACCOUNT_SAMPLE);
 const data=analyze(limitedAccounts,limitedLogs,{days,minimum});
 data.coverage.moneyLimited=logs.length>MONEY_SAMPLE;
 data.coverage.accountsLimited=accounts.length>ACCOUNT_SAMPLE;
 cached={key:cacheKey,at:Date.now(),data};return data;
}
module.exports={riskOverview,analyze};