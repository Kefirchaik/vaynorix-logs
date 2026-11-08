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
 if(c.id==='families'){const familyButton=cell('button','','nav-item');familyButton.id='familyNav';familyButton.dataset.section='family-overview';familyButton.append(cell('span','♜'),document.createTextNode('Семьи · Обзор'));familyButton.addEventListener('click',showFamilies);nav.append(familyButton);}
 const button=cell('button','', 'nav-item');button.dataset.section=c.id;
 button.append(cell('span','▣'),document.createTextNode(c.id==='families'?'История семей (журнал)':c.title));button.addEventListener('click',()=>switchLog(c.id));nav.append(button);}
 if(user.role==='owner'){
  const button=cell('button','','nav-item');button.id='adminNav';button.append(cell('span','⚙'),document.createTextNode('Администраторы'));
  button.addEventListener('click',showAdmins);nav.append(button);
 }
}
async function switchLog(section){
 active=section;page=1;el('familyView').classList.add('hidden');el('adminsView').classList.add('hidden');el('logsView').classList.remove('hidden');el('hero').classList.toggle('hidden',section!=='money');
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
 el('familyView').classList.add('hidden');el('adminsView').classList.remove('hidden');el('logsView').classList.add('hidden');el('hero').classList.add('hidden');el('sectionTitle').textContent='Администраторы';el('sectionGroup').textContent='УПРАВЛЕНИЕ ДОСТУПОМ';el('breadcrumb').textContent='Панель / Администраторы';
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

// Family read-only overview. No mutation endpoints or dynamic HTML from the DB.
let chosenFamily=null,familyListPage=1,familyListNext=false,memberPage=1,memberNext=false,historyPage=1,historyNext=false,familyTab='members';
const familyLabels={1:'Приглашение',2:'Исключение',3:'Деньги',4:'Материалы',5:'Маски',6:'Аптечки',7:'Патроны',8:'Бронежилеты',9:'Автомобили',10:'Ранги',11:'Доступы'};
const fmtNum=n=>Number(n||0).toLocaleString('ru-RU');
function familyError(target,error){target.replaceChildren(cell('div',error.message||String(error),'family-error'));}
function familyNavState(){document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id==='familyNav'));}
async function showFamilies(){
 el('adminsView').classList.add('hidden');el('logsView').classList.add('hidden');el('familyView').classList.remove('hidden');el('hero').classList.add('hidden');
 el('sectionTitle').textContent='Управление просмотром семей';el('sectionGroup').textContent='СООБЩЕСТВО';el('sectionCaption').textContent='Участники, лидеры, деньги и история — только чтение';el('breadcrumb').textContent='Сообщество / Семьи';familyNavState();
 el('shell').querySelector('.sidebar').classList.remove('open');familyListPage=1;chosenFamily=null;el('familySelected').classList.add('hidden');el('familyEmpty').classList.remove('hidden');await loadFamilies();
}
async function loadFamilies(){
 const list=el('familyList');list.replaceChildren(cell('div','Загрузка семей...','family-placeholder'));
 try{
  const r=await api('family-list',{params:{page:familyListPage,q:el('familySearch').value.trim()}});familyListNext=r.hasNext;list.textContent='';
  for(const f of r.rows){
   const b=cell('button','','family-row');b.type='button';b.dataset.family=String(f.id);b.append(cell('strong',f.name||`Семья #${f.id}`),cell('span',`#${f.id} · Лидер: ${f.leader_name||'не назначен'}`),cell('small',`${fmtNum(f.members)} участников · ${fmtNum(f.money)} ₽`));
   b.onclick=()=>selectFamily(f.id);list.append(b);
  }
  if(!r.rows.length)list.append(cell('div','Семьи не найдены','family-placeholder'));
  el('familyListState').textContent=`Показано: ${r.rows.length}`;el('familyListPage').textContent=`Страница ${familyListPage}`;el('familyPrev').disabled=familyListPage===1;el('familyNext').disabled=!familyListNext;
  familyMarkSelected();
 }catch(e){familyError(list,e);el('familyListState').textContent='Ошибка';}
}
function familyMarkSelected(){document.querySelectorAll('.family-row').forEach(x=>x.classList.toggle('selected',x.dataset.family===String(chosenFamily)));}
function statCard(label,value){const d=cell('div','','family-stat');d.append(cell('span',label),cell('strong',value));return d;}
async function selectFamily(id){
 chosenFamily=id;familyMarkSelected();el('familyEmpty').classList.add('hidden');el('familySelected').classList.remove('hidden');
 el('familyName').textContent='Загрузка...';el('familyStats').textContent='';el('familyResources').textContent='';
 try{
  const {family:f}=await api('family-detail',{params:{family:id}});if(chosenFamily!==id)return;
  el('familyName').textContent=f.name||`Семья #${f.id}`;el('familyLeader').textContent=`ID #${f.id} · Лидер: ${f.leader_name||'не назначен'} (аккаунт #${f.owner||0})`;
  el('familyStats').replaceChildren(statCard('Баланс семьи',fmtNum(f.money)+' ₽'),statCard('Семейная валюта',fmtNum(f.moneti)),statCard('Участников',fmtNum(f.members)),statCard('Автомобилей',fmtNum(f.cars)),statCard('Репутация',fmtNum(f.reputation)),statCard('Захватов',fmtNum(f.zaxvati)));
  el('familyResources').replaceChildren(cell('span',`Материалы: ${fmtNum(f.material)}`),cell('span',`Патроны: ${fmtNum(f.patron)}`),cell('span',`Броня: ${fmtNum(f.armour)}`),cell('span',`Аптечки: ${fmtNum(f.heath_kit)}`),cell('span',`Маски: ${fmtNum(f.mask)}`));
  // Rank titles are the part before comma in familynew.rang_1..rang_5.
  window.familyRankNames=Object.fromEntries([1,2,3,4,5].map(n=>[n,String(f['rang_'+n]||'').split(',')[0]||`Ранг ${n}`]));
  memberPage=1;historyPage=1;familyTab='members';familySwitchTab('members');
 }catch(e){el('familyName').textContent=e.message;}
}
function familySwitchTab(tab){
 familyTab=tab;el('familyMembersPane').classList.toggle('hidden',tab!=='members');el('familyHistoryPane').classList.toggle('hidden',tab!=='history');el('familyMembersTab').classList.toggle('selected',tab==='members');el('familyHistoryTab').classList.toggle('selected',tab==='history');
 if(!chosenFamily)return;
 if(tab==='members')loadFamilyMembers();else loadFamilyHistory();
}
function insertEmpty(tbody,cols,label){const tr=document.createElement('tr'),td=cell('td',label,'empty-cell');td.colSpan=cols;tr.append(td);tbody.replaceChildren(tr);}
async function loadFamilyMembers(){
 const fid=chosenFamily,tbody=el('familyMembersRows');insertEmpty(tbody,5,'Загрузка участников...');
 try{
  const r=await api('family-members',{params:{family:fid,page:memberPage,q:el('familyMemberSearch').value.trim()}});if(chosenFamily!==fid||familyTab!=='members')return;
  memberNext=r.hasNext;tbody.textContent='';
  for(const m of r.rows){const tr=document.createElement('tr');const rank=window.familyRankNames?.[m.family_rang]||`Ранг ${m.family_rang}`;for(const x of [m.id,m.name,`${m.family_rang} · ${rank}`,m.level,displayValue('time',m.last_login)])tr.append(cell('td',x));tbody.append(tr);}
  if(!r.rows.length)insertEmpty(tbody,5,'Участники не найдены');el('familyMembersPage').textContent=`Страница ${memberPage}`;el('familyMembersPrev').disabled=memberPage===1;el('familyMembersNext').disabled=!memberNext;
 }catch(e){insertEmpty(tbody,5,e.message);}
}
async function loadFamilyHistory(){
 const fid=chosenFamily,tbody=el('familyHistoryRows');insertEmpty(tbody,5,'Загрузка истории...');
 try{
  const r=await api('family-history',{params:{family:fid,page:historyPage,type:el('familyHistoryType').value,from:el('familyHistoryFrom').value,to:el('familyHistoryTo').value}});if(chosenFamily!==fid||familyTab!=='history')return;
  historyNext=r.hasNext;tbody.textContent='';
  for(const log of r.rows){const tr=document.createElement('tr');for(const x of [displayValue('time',log.time),familyLabels[log.type]||`Тип ${log.type}`,log.actor_name||`#${log.player}`,log.target_name||(log.to_player?`#${log.to_player}`:'—'),log.text])tr.append(cell('td',x));tbody.append(tr);}
  if(!r.rows.length)insertEmpty(tbody,5,'Действий не найдено');el('familyHistoryPage').textContent=`Страница ${historyPage}`;el('familyHistoryPrev').disabled=historyPage===1;el('familyHistoryNext').disabled=!historyNext;
 }catch(e){insertEmpty(tbody,5,e.message);}
}
el('familySearchButton').onclick=()=>{familyListPage=1;loadFamilies();};el('familySearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();familyListPage=1;loadFamilies();}};
el('familyRefresh').onclick=()=>{loadFamilies();if(chosenFamily)selectFamily(chosenFamily);};
el('familyPrev').onclick=()=>{if(familyListPage>1){familyListPage--;loadFamilies();}};el('familyNext').onclick=()=>{if(familyListNext){familyListPage++;loadFamilies();}};
el('familyMembersTab').onclick=()=>familySwitchTab('members');el('familyHistoryTab').onclick=()=>familySwitchTab('history');
el('familyMemberFind').onclick=()=>{memberPage=1;loadFamilyMembers();};el('familyMemberSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();memberPage=1;loadFamilyMembers();}};
el('familyHistoryFind').onclick=()=>{historyPage=1;loadFamilyHistory();};
el('familyMembersPrev').onclick=()=>{if(memberPage>1){memberPage--;loadFamilyMembers();}};el('familyMembersNext').onclick=()=>{if(memberNext){memberPage++;loadFamilyMembers();}};
el('familyHistoryPrev').onclick=()=>{if(historyPage>1){historyPage--;loadFamilyHistory();}};el('familyHistoryNext').onclick=()=>{if(historyNext){historyPage++;loadFamilyHistory();}};
el('loginForm').addEventListener('submit',async e=>{e.preventDefault();note('');try{const r=await api('login',{body:{username:el('loginUser').value,password:el('loginPass').value}});el('loginPass').value='';user=r.user;setView(true);await home();}catch(err){note(err.message);}});
el('logout').addEventListener('click',async()=>{try{await api('logout',{body:{}});}catch{}setView(false);user=null;});
el('filterButton').onclick=()=>{page=1;load();};el('resetButton').onclick=()=>{el('search').value='';el('account').value='';el('dateFrom').value='';el('dateTo').value='';page=1;load();};
el('prev').onclick=()=>{if(page>1){page--;load();}};el('next').onclick=()=>{if(next){page++;load();}};
el('toggleNav').onclick=()=>el('shell').querySelector('.sidebar').classList.toggle('open');
initialize();