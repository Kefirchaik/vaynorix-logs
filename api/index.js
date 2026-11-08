'use strict';
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const catalog = require('./catalog');
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
  if(action==='logs'&&req.method==='GET')return await logs(req,res,user);
  if(action==='admins'&&req.method==='GET'){if(!ensureOwner(user,res))return;return await adminList(res);}
  if(action==='admin-save'&&req.method==='POST'){if(!ensureOwner(user,res))return;return await editAdmin(req,res,false);}
  if(action==='admin-delete'&&req.method==='POST'){if(!ensureOwner(user,res))return;return await editAdmin(req,res,true);}
  return reject(res,404,'Маршрут не найден');
 }catch(err){console.error('[VAYNORIX_API]',err.message);return reject(res,503,'Временная ошибка сервиса. Проверь Vercel Function Logs и переменные окружения.');}
};