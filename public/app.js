'use strict';
let active='money', page=1, user=null, catalog=[], next=false;
const el=id=>document.getElementById(id);
const api=async(action,opts={})=>{
 const params=new URLSearchParams({action,...(opts.params||{})});
 const response=await fetch('/api/index?'+params,{method:opts.body?'POST':'GET',headers:opts.body?{'Content-Type':'application/json'}:{},body:opts.body?JSON.stringify(opts.body):undefined,credentials:'same-origin',cache:'no-store'});
 const body=await response.json();if(!response.ok)throw Error(body.error||'Ошибка запроса');return body;
};
function note(message,success=false){const box=el('loginError');box.textContent=message;box.classList.toggle('success',success);}
function cell(tag,text,css){const e=document.createElement(tag);e.textContent=String(text??'—');if(css)e.className=css;return e;}
function setView(authenticated){el('auth').classList.toggle('hidden',authenticated);el('shell').classList.toggle('hidden',!authenticated);}
async function initialize(){
 try{const r=await api('me');user=r.user;setView(true);await home();}
 catch{setView(false);}
}
async function home(){
 el('nickname').textContent=user.username;el('role').textContent=user.role.toUpperCase();el('roleTag').textContent=user.role.toUpperCase();el('avatar').textContent=user.username[0].toUpperCase();
 const r=await api('catalog');catalog=r.catalog;renderNav();await switchLog('money');
}
function renderNav(){const nav=el('navigation');nav.textContent='';let last='';
 for(const c of catalog){if(c.group!==last){last=c.group;const h=cell('div',last.toUpperCase(),'nav-group');nav.append(h);}
 const button=cell('button','', 'nav-item');button.dataset.section=c.id;
 button.append(cell('span','▣'),document.createTextNode(c.title));button.addEventListener('click',()=>switchLog(c.id));nav.append(button);}
 if(user.role==='owner'){
  const button=cell('button','','nav-item');button.id='adminNav';button.append(cell('span','⚙'),document.createTextNode('Администраторы'));
  button.addEventListener('click',showAdmins);nav.append(button);
 }
}
async function switchLog(section){
 active=section;page=1;el('adminsView').classList.add('hidden');el('logsView').classList.remove('hidden');el('hero').classList.toggle('hidden',section!=='money');
 el('search').value='';el('account').value='';el('dateFrom').value='';el('dateTo').value='';
 const c=catalog.find(x=>x.id===section);el('sectionTitle').textContent=c.title;el('sectionGroup').textContent=c.group.toUpperCase();el('breadcrumb').textContent=c.group+' / '+c.title;
 document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.section===section));
 el('shell').querySelector('.sidebar').classList.remove('open');await load();
}
const labels={id:'ID',uid:'Аккаунт',acc_id:'Счёт / аккаунт',account_id:'Аккаунт',user_id:'Аккаунт',type:'Тип',description:'Описание',uip:'IP',ip:'IP',player_nick:'Ник',time:'Время',created_at:'Дата',completed_at:'Дата',activated_at:'Дата',stat_date:'Дата',money:'Сумма',donate:'BC',amount:'Сумма',final_price:'Цена',bid:'Бизнес',auction_id:'Аукцион',admin:'Администратор',name:'Игрок',reason:'Причина',data:'Данные',status:'Статус',text:'Сообщение'};
const dateFields=new Set(['time','created_at','completed_at','activated_at','stat_date','ban_time','unban_time']);
function displayValue(key,value){
 if(value===null||value===undefined||value==='')return '—';
 if(dateFields.has(key)&&typeof value==='number'&&value>1000000000&&value<5000000000)return new Date(value*1000).toLocaleString('ru-RU');
 if(dateFields.has(key)&&typeof value==='string'&&/^\d{4}-\d\d-\d\d/.test(value))return value.replace('T',' ').slice(0,19);
 return String(value);
}
async function load(){
 el('resultCount').textContent='Загрузка...';
 const filters={section:active,page:page,q:el('search').value.trim(),account:el('account').value.trim(),from:el('dateFrom').value,to:el('dateTo').value};
 try{
  const result=await api('logs',{params:filters});next=result.hasNext;
  const thead=el('tableHead'),tbody=el('tableBody');thead.textContent='';tbody.textContent='';
  const header=document.createElement('tr');for(const k of result.columns)header.append(cell('th',labels[k]||k));thead.append(header);
  for(const row of result.rows){const tr=document.createElement('tr');for(const key of result.columns){const value=displayValue(key,row[key]);const td=cell('td',value);td.title=value;tr.append(td);}tbody.append(tr);}
  if(!result.rows.length){const tr=document.createElement('tr');const td=cell('td','Нет записей по выбранным фильтрам','empty-cell');td.colSpan=result.columns.length;tr.append(td);tbody.append(tr);}
  el('resultCount').textContent=`Записей на странице: ${result.rows.length}`;el('pageText').textContent=`Страница ${page}`;el('prev').disabled=page===1;el('next').disabled=!next;
 }catch(err){el('resultCount').textContent='Ошибка';el('tableBody').replaceChildren(cell('tr',''));el('tableHead').textContent='';el('sectionCaption').textContent=err.message;}
}
async function showAdmins(){
 if(user.role!=='owner')return;
 el('adminsView').classList.remove('hidden');el('logsView').classList.add('hidden');el('hero').classList.add('hidden');el('sectionTitle').textContent='Администраторы';el('sectionGroup').textContent='УПРАВЛЕНИЕ ДОСТУПОМ';el('breadcrumb').textContent='Панель / Администраторы';
 document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id==='adminNav'));
 const r=await api('admins'),parent=el('adminSlots');parent.textContent='';
 for(const admin of r.admins){
  const card=cell('div','','admin-slot'),title=cell('h3',`Admin #${admin.slot}`),description=cell('p',admin.username?`Аккаунт: ${admin.username}`:'Свободное место');
  const form=document.createElement('form');
  const label1=cell('label','Логин (латиница, цифры, _)');const username=document.createElement('input');username.required=true;username.minLength=3;username.maxLength=24;username.value=admin.username;username.autocomplete='off';label1.append(username);
  const label2=cell('label','Новый пароль (от 12 символов)');const password=document.createElement('input');password.type='password';password.required=true;password.minLength=12;password.autocomplete='new-password';label2.append(password);
  const actions=cell('div','','actions'),save=cell('button','Сохранить / обновить','primary');save.type='submit';actions.append(save);
  if(admin.username){const remove=cell('button','Удалить','secondary');remove.type='button';remove.onclick=async()=>{
   if(!confirm(`Удалить администратора ${admin.username}?`))return;
   try{await api('admin-delete',{body:{slot:admin.slot}});await showAdmins();}catch(e){alert(e.message);}
  };actions.append(remove);}
  form.append(label1,label2,actions);form.onsubmit=async e=>{e.preventDefault();try{await api('admin-save',{body:{slot:admin.slot,username:username.value,password:password.value}});await showAdmins();}catch(error){alert(error.message);}};
  card.append(title,description,form);parent.append(card);
 }
}
el('loginForm').addEventListener('submit',async e=>{e.preventDefault();note('');try{const r=await api('login',{body:{username:el('loginUser').value,password:el('loginPass').value}});el('loginPass').value='';user=r.user;setView(true);await home();}catch(err){note(err.message);}});
el('logout').addEventListener('click',async()=>{try{await api('logout',{body:{}});}catch{}setView(false);user=null;});
el('filterButton').onclick=()=>{page=1;load();};el('resetButton').onclick=()=>{el('search').value='';el('account').value='';el('dateFrom').value='';el('dateTo').value='';page=1;load();};
el('prev').onclick=()=>{if(page>1){page--;load();}};el('next').onclick=()=>{if(next){page++;load();}};
el('toggleNav').onclick=()=>el('shell').querySelector('.sidebar').classList.toggle('open');
initialize();