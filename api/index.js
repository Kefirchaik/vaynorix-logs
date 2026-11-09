'use strict';
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const catalog = require('./catalog');
const playerTools = require('./player');
const {riskOverview} = require('./antifraud');
const {cachedOverview} = require('./overview');
const COOKIE = 'vaynorix_session';
let db;
const required = ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD','SESSION_SECRET'];
const env = k => process.env[k];
const ready = () => required.every(k => env(k) && env(k).length > 0) && env('SESSION_SECRET').length >= 32;
const safeEqual = (a,b) => { const x=Buffer.from(String(a)), y=Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x,y); };
const digest = a => crypto.createHash('sha256').update(String(a)).digest('hex');
const key = slot => `vaynorix:admin:${slot}`;
// All application accounts and login rate limits live in the EXISTING game MariaDB.
// No new SQL user, no Redis. Only the two vaynorix_logs_* tables are ever written.
async function store(command, id, value) {
 const pool=connection();
 const match=/^vaynorix:admin:([012])$/.exec(id);
 if(match){
  const slot=Number(match[1]);
  if(command==='GET'){
   const [rows]=await pool.execute('SELECT username,password_hash,enabled,version FROM `vaynorix_logs_users` WHERE slot=? LIMIT 1',[slot]);
   if(!rows.length) return null;
   const u=rows[0];
   return JSON.stringify({username:u.username,passwordHash:u.password_hash,enabled:Boolean(u.enabled),version:u.version});
  }
  if(command==='SET' && slot!==0){
   const u=JSON.parse(value);
   await pool.execute(`INSERT INTO \`vaynorix_logs_users\` (slot,role,username,password_hash,enabled,version)
    VALUES (?,'admin',?,?,1,?) ON DUPLICATE KEY UPDATE username=VALUES(username),password_hash=VALUES(password_hash),enabled=1,version=VALUES(version)`,[slot,u.username,u.passwordHash,u.version]);
   return 'OK';
  }
  if(command==='DEL' && slot!==0){
   await pool.execute('DELETE FROM `vaynorix_logs_users` WHERE slot=? AND role=\'admin\'',[slot]);
   return 1;
  }
 }
 const login=/^vaynorix:login:([a-f0-9]{64})$/.exec(id);
 if(login){
  const fingerprint=login[1];
  if(command==='INCR'){
   await pool.execute(`INSERT INTO \`vaynorix_logs_login_attempts\` (fingerprint,attempts,expires_at)
    VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))
    ON DUPLICATE KEY UPDATE
    attempts=IF(expires_at<=UTC_TIMESTAMP(),1,attempts+1),
    expires_at=IF(expires_at<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE),expires_at)`,[fingerprint]);
   const [rows]=await pool.execute('SELECT attempts FROM `vaynorix_logs_login_attempts` WHERE fingerprint=?',[fingerprint]);
   return Number(rows[0]?.attempts||1);
  }
  if(command==='EXPIRE') return 1; // TTL is set atomically by INCR in MariaDB.
  if(command==='DEL'){
   await pool.execute('DELETE FROM `vaynorix_logs_login_attempts` WHERE fingerprint=?',[fingerprint]);return 1;
  }
 }
 throw new Error('Unsupported auth storage operation');
}
async function seedOwner(username,password){
 const starterName=env('OWNER_USERNAME'),starterPassword=env('OWNER_PASSWORD');
 if(!starterName||!starterPassword||starterPassword.length<12||!/^[A-Za-z0-9_]{3,24}$/.test(starterName))return;
 if(username.toLowerCase()!==starterName.toLowerCase()||!safeEqual(digest(password),digest(starterPassword)))return;
 // A one-time bootstrap: after first login Owner remains in MariaDB, even if bootstrap env vars are removed.
 await connection().execute(`INSERT IGNORE INTO \`vaynorix_logs_users\` (slot,role,username,password_hash,enabled,version)
  VALUES (0,'owner',?,?,1,?)`,[starterName,passwordHash(starterPassword),crypto.randomBytes(12).toString('hex')]);
}
function passwordHash(password) {
  const salt=crypto.randomBytes(16).toString('hex');
  return salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
}
function matchesHash(password,stored){
  try {const [salt,hash]=stored.split(':');return safeEqual(crypto.scryptSync(password,salt,64).toString('hex'),hash);}catch{return false;}
}
function cookie(res,value,maxAge){
 res.setHeader('Set-Cookie',`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
}
function token(payload){
 const data=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return data+'.'+crypto.createHmac('sha256',env('SESSION_SECRET')).update(data).digest('base64url');
}
function verifyToken(req){
 try{
  const all=req.headers.cookie||'';
  const v=all.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
  if(!v) return null;
  const [data,sig]=v.slice(COOKIE.length+1).split('.');
  if(!data||!sig||!safeEqual(crypto.createHmac('sha256',env('SESSION_SECRET')).update(data).digest('base64url'),sig))return null;
  const payload=JSON.parse(Buffer.from(data,'base64url').toString());
  if(!payload.exp||payload.exp<Date.now()||!['owner','admin'].includes(payload.role))return null;
  return payload;
 }catch{return null;}
}
async function currentUser(req){
 const p=verifyToken(req);
 if(!p) return null;
 const slot=Number(p.slot);
 if(![0,1,2].includes(slot)) return null;
 const raw=await store('GET',key(slot));
 if(!raw)return null;
 const u=JSON.parse(raw);
 const role=slot===0?'owner':'admin';
 return u.enabled && p.role===role && u.username===p.username && u.version===p.version ? p:null;
}
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));}
function reject(res,status,message){return json(res,status,{error:message});}
function parseBody(req){const b=req.body;if(!b)return {}; if(typeof b==='object')return b;try{return JSON.parse(b);}catch{return {};}}
function noCrossSite(req){
 const origin=req.headers.origin;
 if(!origin)return false; // Non-browser clients may omit Origin; cookie + same-site still enforced.
 try{return new URL(origin).host!==(req.headers['x-forwarded-host']||req.headers.host);}catch{return true;}
}
function ensureOwner(user,res){if(!user||user.role!=='owner'){reject(res,403,'Только для Owner');return false;}return true;}
async function login(req,res){
 const b=parseBody(req), username=String(b.username||'').trim(), password=String(b.password||'');
 if(username.length<3||username.length>32||password.length>256)return reject(res,400,'Неверные данные');
 await seedOwner(username,password);
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
 const limiter='vaynorix:login:'+digest(ip+':'+username.toLowerCase());
 const attempts=Number(await store('INCR',limiter));
 if(attempts>5)return reject(res,429,'Слишком много попыток. Повтори через 15 минут.');
 let payload=null;
 for(const slot of [0,1,2]){
  const raw=await store('GET',key(slot));if(!raw)continue;
  const u=JSON.parse(raw);
  if(u.enabled&&u.username.toLowerCase()===username.toLowerCase()&&matchesHash(password,u.passwordHash)){
   payload={role:slot===0?'owner':'admin',username:u.username,slot,version:u.version};break;
  }
 }
 if(!payload)return reject(res,401,'Неправильный логин или пароль');
 await store('DEL',limiter);
 cookie(res,token({...payload,exp:Date.now()+8*3600*1000}),8*3600);
 return json(res,200,{user:{username:payload.username,role:payload.role}});
}
async function adminList(res){
 const admins=[];
 for(const slot of [1,2]){
  const raw=await store('GET',key(slot));
  if(raw){const u=JSON.parse(raw);admins.push({slot,username:u.username,enabled:u.enabled});}
  else admins.push({slot,username:'',enabled:false});
 }
 json(res,200,{admins});
}
async function editAdmin(req,res,remove){
 const b=parseBody(req),slot=Number(b.slot);
 if(![1,2].includes(slot))return reject(res,400,'Неверный слот');
 if(remove){await store('DEL',key(slot));return json(res,200,{ok:true});}
 const username=String(b.username||'').trim(),password=String(b.password||'');
 if(!/^[A-Za-z0-9_]{3,24}$/.test(username))return reject(res,400,'Логин: 3–24 латинских символа, цифры или _');
 if(password.length<12||password.length>128)return reject(res,400,'Пароль должен содержать 12–128 символов');
 const ownerRaw=await store('GET',key(0));
 if(ownerRaw&&JSON.parse(ownerRaw).username.toLowerCase()===username.toLowerCase())return reject(res,409,'Этот логин занят Owner');
 const other=await store('GET',key(slot===1?2:1));
 if(other&&JSON.parse(other).username.toLowerCase()===username.toLowerCase())return reject(res,409,'Такой логин уже существует');
 const obj={username,passwordHash:passwordHash(password),enabled:true,version:crypto.randomBytes(12).toString('hex')};
 await store('SET',key(slot),JSON.stringify(obj));
 json(res,200,{ok:true});
}
function connection(){
 if(!db){db=mysql.createPool({host:env('DB_HOST'),port:Number(env('DB_PORT')||3306),database:env('DB_NAME'),user:env('DB_USER'),password:env('DB_PASSWORD'),ssl:env('DB_SSL')==='true'?{}:undefined,charset:'utf8mb4',waitForConnections:true,connectionLimit:3,connectTimeout:6000,queueLimit:30,timezone:'Z'});}
 return db;
}
function mask(value){return String(value??'').replace(/\d+(?=\.\d+\.\d+$)/,'***').replace(/(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}$/,'$1.***.***');}
function day(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));}
async function logs(req,res,user){
 const id=String(req.query.section||'money'),c=catalog[id];
 if(!c)return reject(res,400,'Неизвестный журнал');
 const page=Math.max(1,Math.min(200,Number.parseInt(req.query.page,10)||1));
 const account=String(req.query.account||'').trim(),q=String(req.query.q||'').trim().slice(0,80);
 const from=req.query.from,to=req.query.to;
 if((from&&!day(from))||(to&&!day(to)))return reject(res,400,'Неверная дата');
 if(account&&!/^\d{1,10}$/.test(account))return reject(res,400,'Некорректный ID аккаунта');
 const cols=c.columns.map(col=>`t.\`${col}\``).join(', ');
 let join='',accountField='';
 if(c.account==='BANK'){
  join=' LEFT JOIN `bank_accounts` ba ON ba.`id`=t.`acc_id` LEFT JOIN `accounts` p ON p.`id`=ba.`uid`';
  accountField='ba.`uid`';
 }else if(c.account){
  join=` LEFT JOIN \`accounts\` p ON p.\`id\`=t.\`${c.account}\``;
  accountField=`t.\`${c.account}\``;
 }
 const extra=accountField?', p.`name` AS `player_nick`':'';
 let sql=`SELECT ${cols}${extra} FROM \`${c.table}\` t${join} WHERE 1=1`,params=[];
 if(accountField&&account){sql+=` AND ${accountField}=?`;params.push(Number(account));}
 if(q){
  const pieces=c.search.map(x=>`t.\`${x}\` LIKE ?`);
  if(accountField)pieces.push('p.`name` LIKE ?');
  if(pieces.length){sql+=` AND (${pieces.join(' OR ')})`;params.push(...pieces.map(()=>'%'+q+'%'));}
 }
 if(c.time){
  const col=`t.\`${c.time}\``;
  const expr=c.mode==='unix'?`FROM_UNIXTIME(${col})`:col;
  if(from){sql+=` AND ${expr}>=?`;params.push(from+' 00:00:00');}
  if(to){sql+=` AND ${expr}<?`;const end=new Date(to+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);params.push(end.toISOString().slice(0,10)+' 00:00:00');}
 }
 sql+=` ORDER BY t.\`${c.order}\` DESC LIMIT ? OFFSET ?`;
 params.push(26,(page-1)*25);
 let rows;
 try{[rows]=await connection().execute(sql,params);}catch(e){console.error('[LOGS_QUERY]',c.table,e.code||'database error');return reject(res,503,'Журнал недоступен. Проверь структуру таблицы и подключение БД.');}
 const hasNext=rows.length>25;
 const result=rows.slice(0,25).map(row=>{
  if(user.role==='owner')return row;
  for(const col of Object.keys(row))if(col==='ip'||col==='uip')row[col]=mask(row[col]);
  return row;
 });
 json(res,200,{section:id,title:c.title,columns:[...c.columns,...(accountField?['player_nick']:[])],rows:result,page,hasNext});
}
// Family overview: all queries are SELECT and use the V8 game schema.
// familynew.owner = accounts.id; accounts.family_id = familynew.id.
function familyQuery(req) {
 const raw=String(req.query.family||'');
 if(!/^[1-9]\d{0,9}$/.test(raw))return null;
 const id=Number(raw);
 return Number.isSafeInteger(id)&&id<=2147483647?id:null;
}
function familyPage(raw){const n=Number(raw||1);return Number.isInteger(n)?Math.max(1,Math.min(n,100)):1;}
function familySearch(raw){return String(raw||'').trim().slice(0,64).replace(/[%_\\]/g,'\\$&');}
function dateBound(s){return day(s)?Math.floor(Date.parse(s+'T00:00:00Z')/1000):null;}
const familyBase=`SELECT f.id,f.name,f.owner,leader.name AS leader_name,
 f.money,f.moneti,f.reputation,f.zaxvati,f.syndicate,f.slot_veh,f.house,
 f.level_storage,f.level_weapon,f.level_compound,
 f.material,f.patron,f.armour,f.heath_kit,f.mask,
 f.rang_1,f.rang_2,f.rang_3,f.rang_4,f.rang_5
 FROM familynew f LEFT JOIN accounts leader ON leader.id=f.owner`;
async function familyCounts(rows){
 if(!rows.length)return rows;
 const ids=rows.map(r=>Number(r.id));
 const placeholders=ids.map(()=>'?').join(',');
 const [members]=await connection().execute(`SELECT family_id,COUNT(*) AS total FROM accounts WHERE family_id IN (${placeholders}) GROUP BY family_id`,ids);
 const [cars]=await connection().execute(`SELECT family_owner,COUNT(*) AS total FROM family_cars WHERE family_owner IN (${placeholders}) GROUP BY family_owner`,ids);
 const mem=new Map(members.map(x=>[Number(x.family_id),Number(x.total)]));
 const veh=new Map(cars.map(x=>[Number(x.family_owner),Number(x.total)]));
 return rows.map(x=>({...x,members:mem.get(Number(x.id))||0,cars:veh.get(Number(x.id))||0}));
}
async function familyList(req,res){
 const page=familyPage(req.query.page),search=familySearch(req.query.q),params=[];
 let sql=familyBase;
 if(search){sql+=' WHERE (f.name LIKE ? OR leader.name LIKE ?';params.push('%'+search+'%','%'+search+'%');
  if(/^\d{1,9}$/.test(search)){sql+=' OR f.id=?';params.push(Number(search));}
  sql+=')';}
 sql+=' ORDER BY f.id DESC LIMIT ? OFFSET ?';params.push(21,(page-1)*20);
 const [results]=await connection().execute(sql,params);
 const hasNext=results.length>20;
 return json(res,200,{rows:await familyCounts(results.slice(0,20)),page,hasNext});
}
async function familyDetail(req,res){
 const id=familyQuery(req);if(id===null)return reject(res,400,'Некорректный ID семьи');
 const [rows]=await connection().execute(familyBase+' WHERE f.id=? LIMIT 1',[id]);
 if(!rows.length)return reject(res,404,'Семья не найдена');
 const [family]=await familyCounts(rows);
 return json(res,200,{family});
}
async function familyMembers(req,res){
 const id=familyQuery(req);if(id===null)return reject(res,400,'Некорректный ID семьи');
 const page=familyPage(req.query.page),q=familySearch(req.query.q),params=[id];
 let sql='SELECT a.id,a.name,a.level,a.family_rang,a.family_mute,a.family_vig,a.last_login FROM accounts a WHERE a.family_id=?';
 if(q){sql+=' AND (a.name LIKE ?';params.push('%'+q+'%');if(/^\d{1,9}$/.test(q)){sql+=' OR a.id=?';params.push(Number(q));}sql+=')';}
 sql+=' ORDER BY a.family_rang DESC,a.id ASC LIMIT ? OFFSET ?';params.push(26,(page-1)*25);
 const [rows]=await connection().execute(sql,params);
 return json(res,200,{rows:rows.slice(0,25),page,hasNext:rows.length>25});
}
async function familyHistory(req,res){
 const id=familyQuery(req);if(id===null)return reject(res,400,'Некорректный ID семьи');
 const page=familyPage(req.query.page),from=req.query.from,to=req.query.to;
 if((from&&!day(from))||(to&&!day(to)))return reject(res,400,'Неверная дата');
 const rawType=String(req.query.type||'');
 if(rawType&&!/^(?:[1-9]|10|11)$/.test(rawType))return reject(res,400,'Некорректный тип события');
 let sql=`SELECT l.id,l.family,l.player,l.to_player,l.text,l.type,l.time,
 actor.name AS actor_name,target.name AS target_name
 FROM family_log l LEFT JOIN accounts actor ON actor.id=l.player
 LEFT JOIN accounts target ON target.id=l.to_player WHERE l.family=?`;
 const params=[id];
 if(rawType){sql+=' AND l.type=?';params.push(Number(rawType));}
 if(from){sql+=' AND l.time>=?';params.push(dateBound(from));}
 if(to){sql+=' AND l.time<?';params.push(dateBound(to)+86400);}
 sql+=' ORDER BY l.time DESC,l.id DESC LIMIT ? OFFSET ?';params.push(26,(page-1)*25);
 const [rows]=await connection().execute(sql,params);
 return json(res,200,{rows:rows.slice(0,25),page,hasNext:rows.length>25});
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!ready())return reject(res,503,'Сайт ещё не настроен. Укажи переменные окружения Vercel.');
 if(!['GET','POST'].includes(req.method))return reject(res,405,'Недопустимый метод');
 if(req.method==='POST'&&noCrossSite(req))return reject(res,403,'Неверный источник запроса');
 const action=String(req.query.action||'me');
 try{
  if(action==='login'&&req.method==='POST')return await login(req,res);
  if(action==='logout'&&req.method==='POST'){cookie(res,'',0);return json(res,200,{ok:true});}
  const user=await currentUser(req);
  if(!user)return reject(res,401,'Требуется вход');
  if(action==='me'&&req.method==='GET')return json(res,200,{user:{username:user.username,role:user.role}});
  if(action==='catalog'&&req.method==='GET')return json(res,200,{catalog:Object.values(catalog).map(({id,title,group})=>({id,title,group}))});
  if(action==='server-overview'&&req.method==='GET')return json(res,200,await cachedOverview(connection()));
  if(action==='logs'&&req.method==='GET')return await logs(req,res,user);
  if(action==='risk-overview'&&req.method==='GET')return json(res,200,await riskOverview(connection(),req.query));
  if(action==='family-list'&&req.method==='GET')return await familyList(req,res);
  if(action==='family-detail'&&req.method==='GET')return await familyDetail(req,res);
  if(action==='family-members'&&req.method==='GET')return await familyMembers(req,res);
  if(action==='family-history'&&req.method==='GET')return await familyHistory(req,res);
  if(['player-config','player-search','player-profile','player-rows','player-related'].includes(action)&&req.method==='GET'){const result=await playerTools.route(connection(),req.query);return json(res,result.status,result.body);}
  if(action==='admins'&&req.method==='GET'){if(!ensureOwner(user,res))return;return await adminList(res);}
  if(action==='admin-save'&&req.method==='POST'){if(!ensureOwner(user,res))return;return await editAdmin(req,res,false);}
  if(action==='admin-delete'&&req.method==='POST'){if(!ensureOwner(user,res))return;return await editAdmin(req,res,true);}
  return reject(res,404,'Маршрут не найден');
 }catch(err){console.error('[VAYNORIX_API]',err.message);return reject(res,503,'Временная ошибка сервиса. Проверь Vercel Function Logs и переменные окружения.');}
};
