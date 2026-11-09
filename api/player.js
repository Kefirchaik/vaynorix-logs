'use strict';
// VAYNORIX RP 1.4.0: authenticated, read-only player lookup.
// Field and table allowlists are grounded in the supplied game SQL schema.
// NEVER expose password/salt/email/admin secrets/bank PIN/account IPs.
const profileGroups = Object.freeze({
 'Аккаунт':['id','name','level','exp','sex','skin','reg_time','last_login','online','totalhour','refer'],
 'Финансы':['money','bank','rub','coins','moneti','donate_current','donate_total','phone_balance','premium','premium_date'],
 'Семья и организация':['family_id','family_rang','team','subdivison','job','wage','admin','admin_warn','helper','org_skin','org_form'],
 'Имущество':['house','business','garage','car_slots','house_slots','buss_slots'],
 'Состояние':['health','med','law_abiding','power','game_for_hour','game_for_day','game_for_day_prev','player'],
 'Предупреждения и ограничения':['warn','warn_time','mute','jail','jail_fsin','suspect','family_mute','family_vig','antisliv'],
 'Лицензии':['driving_lic','weapon_lic'],
 'Ресурсы и награды':['drugs','ammo','metall','gifts','case','rewards','case_bonus'],
 'Навыки оружия':['skill_colt','skill_sdpistol','skill_deagle','skill_shotgun','skill_mp5','skill_ak47','skill_m4','skill_sniper_rifle','skill_sawnoff','skill_combat_sg','skill_micro_uzi']
});
const profileFields=[...new Set(Object.values(profileGroups).flat())];
const inventories=Object.freeze({
 cars:{label:'Автомобили',table:'ownable_cars',owner:'owner_id',order:'id',cols:'id model_id number status color_1 color_2 comfort sport sport_plus drift'},
 houses:{label:'Дома',table:'houses',owner:'owner_id',order:'id',cols:'id name type price improvements rent_time'},
 apartments:{label:'Квартиры / купленные дома',table:'bought_houses',owner:'account_id',order:'house_id',cols:'house_id apt remont shkaf kv rent_time'},
 newhouses:{label:'Новые дома',table:'housesnew',owner:'accounts_id',order:'id',cols:'id owner_name price type'},
 business:{label:'Бизнесы',table:'business',owner:'owner_id',order:'id',cols:'id name type balance price products improvements'},
 fuel:{label:'АЗС',table:'fuel_stations',owner:'owner_id',order:'id',cols:'id name balance price fuels improvements'},
 garages:{label:'Гаражи',table:'garages',owner:'owner_id',order:'id',cols:'id price improvements rent_time'},
 items:{label:'Инвентарь',table:'inventory',owner:'account_id',order:'id',cols:'id item_id model_id slot amount extra_1 extra_2 created_at'},
 legacyitems:{label:'Предметы (старая система)',table:'inventoryitems',owner:'playerid',order:'id',cols:'id item_id count position data'},
 skins:{label:'Скины',table:'player_skins',owner:'player_id',order:'id',cols:'id skin_model skin_name obtained_date'},
 invskins:{label:'Купленные скины',table:'invskins',owner:'account_id',order:'internal_id',cols:'internal_id modelid purchased_at'},
 accessory:{label:'Аксессуары',table:'accessory_inventory',owner:'player_id',order:'id',cols:'id acs_id `use`'},
 houses_rent:{label:'Аренда помещений',table:'houses_renters',owner:'owner_id',order:'id',cols:'id house_id room_id rent_time time'},
 prizes:{label:'Награды',table:'player_rewards',owner:'player_id',order:'id',cols:'id reward_id case_id rarity reward_type status obtained_date claimed_date count'},
 cases:{label:'Кейсы',table:'player_cases',owner:'account_id',order:'case_id',cols:'case_id amount updated_at'}
});
const history=Object.freeze({
 money:{label:'Денежные операции',table:'money_log',owner:'uid',order:'id',cols:'id money description time'},
 donate:{label:'Донат / BC',table:'donate_log',owner:'uid',order:'id',cols:'id donate description time'},
 actions:{label:'Админ-действия',table:'action_log',owner:'acc_id',order:'id',cols:'id type description time'},
 bank:{label:'История дополнительных счетов',table:'bank_accounts_log',owner:'acc_id',order:'id',cols:'id description time',join:' JOIN bank_accounts ba ON ba.id=t.acc_id',where:'ba.uid'},
 bizprofit:{label:'Доходы бизнесов',table:'business_profit',owner:'uid',order:'id',cols:'id bid money time'},
 fuelprofit:{label:'Доходы АЗС',table:'fuel_stations_profit',owner:'uid',order:'id',cols:'id fid money time'},
 marketplace:{label:'Маркетплейс',table:'marketplace_history',owner:'account_id',order:'id',cols:'id item_name amount price status created_at'},
 auctions:{label:'Ставки на аукционах',table:'auction_bids',owner:'bidder_account_id',order:'id',cols:'id auction_id amount status created_at'},
 ban:{label:'Блокировки (журнал)',table:'ban_list',owner:'user_id',order:'id',cols:'id admin description time ban_time'},
 block:{label:'Блок-лист',table:'listban',owner:'acc_id',order:'ban_time',cols:'acc_id player_name admin_name reason ban_time unban_time'},
 tickets:{label:'Штрафы',table:'tickets',owner:'uid',order:'id',cols:'id amount description issuer status'},
 payouts:{label:'Компенсации',table:'return_money',owner:'uid',order:'id',cols:'id money description status'},
 family:{label:'Действия в семье',table:'family_log',owner:'player',order:'id',cols:'id family player to_player text type time'}
});
const specKinds=Object.freeze({...inventories,...history});
const isId = raw => /^[1-9]\d{0,9}$/.test(String(raw||'')) && Number(raw)<=2147483647;
const pageNum = raw => Math.max(1,Math.min(100,parseInt(String(raw||'1'),10)||1));
const quoteCol = name => name==='`use`'?'`use`':`\`${name}\``;
const sanitize = text=>String(text||'').trim().slice(0,24);
function config(){
 return { profileGroups,assets:Object.entries(inventories).map(([id,{label}])=>({id,label})),histories:Object.entries(history).map(([id,{label}])=>({id,label})) };
}
async function search(pool,query){
 const q=sanitize(query.q);if(!q)return {rows:[]};
 if(isId(q)){
  const [rows]=await pool.execute('SELECT id,name,level,money,bank,admin,online FROM accounts WHERE id=? LIMIT 1',[Number(q)]);
  if(rows.length)return {rows};
 }
 if(q.length<2)return {rows:[]};
 const escaped=q.replace(/[\\%_]/g,'\\$&');
 const [rows]=await pool.execute('SELECT id,name,level,money,bank,admin,online FROM accounts WHERE name LIKE ? ORDER BY id DESC LIMIT 15',[escaped+'%']);
 return {rows};
}
async function profile(pool,query){
 if(!isId(query.id))return null;
 const id=Number(query.id);
 const cols=profileFields.map(x=>`a.${quoteCol(x)}`).join(',');
 const [rows]=await pool.execute(`SELECT ${cols}, f.name AS family_name, f.owner AS family_owner FROM accounts a LEFT JOIN familynew f ON f.id=a.family_id WHERE a.id=? LIMIT 1`,[id]);
 if(!rows.length)return null;
 const [accounts]=await pool.execute('SELECT id,name,balance,reg_time FROM bank_accounts WHERE uid=? ORDER BY id DESC LIMIT 25',[id]);
 const [wallets]=await pool.execute('SELECT balance,updated_at FROM marketplace_wallet WHERE account_id=? LIMIT 1',[id]);
 return {player:rows[0],profileGroups,bankAccounts:accounts,marketplaceWallet:wallets[0]||null};
}
async function rows(pool,query){
 if(!isId(query.id))return null;
 const kind=String(query.kind||''),spec=specKinds[kind];
 if(!spec)return undefined;
 const page=pageNum(query.page),columns=spec.cols.split(' ');
 // All identifiers below come from immutable server-side allowlists, never user input.
 const fields=columns.map(name=>`t.${quoteCol(name)}`).join(',');
 const where=spec.where||`t.${quoteCol(spec.owner)}`;
 const sql=`SELECT ${fields} FROM \`${spec.table}\` t${spec.join||''} WHERE ${where}=? ORDER BY t.${quoteCol(spec.order)} DESC LIMIT ? OFFSET ?`;
 const [records]=await pool.execute(sql,[Number(query.id),21,(page-1)*20]);
 return {kind,label:spec.label,columns:columns.map(x=>x.replaceAll('`','')),rows:records.slice(0,20),page,hasNext:records.length>20};
}
function validIp(ip){return ip&&ip!=='0'&&ip!=='0.0.0.0'&&ip!=='255.255.255.255'&&ip!=='127.0.0.1'&&ip!=='None';}
async function related(pool,query){
 if(!isId(query.id))return null;
 const id=Number(query.id);
 const [base]=await pool.execute('SELECT reg_ip,last_ip FROM accounts WHERE id=? LIMIT 1',[id]);
 if(!base.length)return null;
 const ips=[base[0].reg_ip,base[0].last_ip].filter(validIp);
 if(!ips.length)return {rows:[],note:'У аккаунта нет пригодных IP для сравнения.'};
 const [match]=await pool.execute('SELECT id,name,level,reg_ip,last_ip FROM accounts WHERE id<>? AND (reg_ip IN (?,?) OR last_ip IN (?,?)) ORDER BY id DESC LIMIT 21',[id,ips[0],ips[1]||ips[0],ips[0],ips[1]||ips[0]]);
 return {rows:match.slice(0,20).map(item=>({id:item.id,name:item.name,level:item.level,matchRegistration:ips.includes(item.reg_ip)&&validIp(item.reg_ip),matchLastLogin:ips.includes(item.last_ip)&&validIp(item.last_ip)})),hasNext:match.length>20,note:'Совпадение IP не доказывает, что аккаунты принадлежат одному человеку. Проверь операции и историю.'};
}
async function route(pool,query){
 switch(String(query.action||'')){
  case 'player-search':return {status:200,body:await search(pool,query)};
  case 'player-config':return {status:200,body:config()};
  case 'player-profile':{const r=await profile(pool,query);return r?{status:200,body:r}:{status:404,body:{error:'Аккаунт не найден'}};}
  case 'player-rows':{const r=await rows(pool,query);return r===undefined?{status:400,body:{error:'Неизвестная категория'}}:r?{status:200,body:r}:{status:400,body:{error:'Некорректный ID'}};}
  case 'player-related':{const r=await related(pool,query);return r?{status:200,body:r}:{status:404,body:{error:'Аккаунт не найден'}};}
  default:return {status:404,body:{error:'Маршрут не найден'}};
 }
}
module.exports={route,profileGroups,config,search,profile,rows,related};
