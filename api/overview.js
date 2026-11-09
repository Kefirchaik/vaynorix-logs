'use strict';
// Read-only server statistics, based on the VAYNORIX game MariaDB dump.
const TTL=30000;
const parts=[
 ['cash','Наличные игроков','money'],
 ['mainBank','Основной банк игроков','bank'],
 ['extraBank','Дополнительные счета','balance'],
 ['families','Казна семей','money'],
 ['businesses','Счета бизнесов','balance'],
 ['marketplace','Кошельки маркетплейса','balance']
];
function integer(v){
 const s=String(v??'0').trim();
 if(!/^-?\d+(\.0+)?$/.test(s))throw Error('Invalid money value');
 return BigInt(s.split('.')[0]);
}
async function readOverview(db){
 const queries=[
  'SELECT COUNT(*) AS account_count, COALESCE(SUM(CASE WHEN online=1 THEN 1 ELSE 0 END),0) AS online_flags, COALESCE(SUM(money),0) AS cash, COALESCE(SUM(bank),0) AS main_bank FROM accounts',
  'SELECT COALESCE(SUM(balance),0) AS amount FROM bank_accounts',
  'SELECT COALESCE(SUM(money),0) AS amount FROM familynew',
  'SELECT COALESCE(SUM(balance),0) AS amount FROM business',
  'SELECT COALESCE(SUM(balance),0) AS amount FROM marketplace_wallet'
 ];
 const result=await Promise.all(queries.map(q=>db.execute(q)));
 const first=result[0][0][0];
 if(!first)throw Error('No account aggregate');
 const amounts=[first.cash,first.main_bank,...result.slice(1).map(x=>x[0][0]?.amount)];
 const breakdown=parts.map(([key,label],i)=>({key,label,amount:String(integer(amounts[i]))}));
 return {
  accounts:String(integer(first.account_count)),
  online:String(integer(first.online_flags)),
  totalMoney:String(breakdown.reduce((a,x)=>a+BigInt(x.amount),0n)),
  breakdown, sampledAt:new Date().toISOString(),
  onlineDisclaimer:'Онлайн ориентировочный: флаг accounts.online иногда сбрасывается при промежуточном сохранении игрока и может устареть после аварийного перезапуска сервера.',
  moneyNote:'Сумма остатков в шести хранилищах: наличные, основной и дополнительный банк, семьи, бизнесы и маркетплейс. Логи переводов не суммируются.'
 };
}
let saved=null,at=0,pending=null;
function cachedOverview(db){
 if(saved&&Date.now()-at<TTL)return Promise.resolve(saved);
 if(pending)return pending;
 pending=readOverview(db).then(result=>{saved=result;at=Date.now();return result;}).finally(()=>{pending=null;});
 return pending;
}
module.exports={readOverview,cachedOverview,integer};
