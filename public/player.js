'use strict';
// Staff-only player directory. All data is textContent; never insert DB values as markup.
let selectedPlayer=null,playerOptions=null,playerKind='cars',playerPage=1,playerTab='general',playerRequest=0,playerSearchRequest=0;
const playerNames={id:'ID',name:'Ник',level:'Уровень',exp:'Опыт',sex:'Пол (код)',skin:'Скин',reg_time:'Регистрация',last_login:'Последний вход',online:'Онлайн (по БД)',totalhour:'Всего часов',refer:'Реферал (ID)',money:'Наличные',bank:'Основной банк',rub:'Донат-рубли',coins:'Монеты',moneti:'Семейная валюта',donate_current:'BC (текущий)',donate_total:'Донат (всего)',phone_balance:'Баланс игрового телефона',premium:'Премиум',premium_date:'Срок премиума',family_id:'ID семьи',family_rang:'Ранг в семье',team:'Организация (ID)',subdivison:'Подразделение (ID)',job:'Работа (ID)',wage:'Зарплата',admin:'Админ-уровень',admin_warn:'Выговоры администрации',helper:'Уровень поддержки',org_skin:'Форма организации',org_form:'Организационная форма',house:'ID дома',business:'ID бизнеса',garage:'ID гаража',car_slots:'Слоты авто',house_slots:'Слоты домов',buss_slots:'Слоты бизнесов',health:'Здоровье',med:'Медицина',law_abiding:'Законопослушность',power:'Сила',game_for_hour:'Игра за час',game_for_day:'Игра за день',game_for_day_prev:'Вчерашний онлайн',player:'Игровой параметр',warn:'Предупреждения',warn_time:'Срок предупреждения',mute:'Мут',jail:'Тюрьма',jail_fsin:'ФСИН',suspect:'Розыск',family_mute:'Семейный мут',family_vig:'Семейные выговоры',antisliv:'Антислив (флаг)',driving_lic:'Права',weapon_lic:'Лицензия на оружие',drugs:'Наркотики (игра)',ammo:'Патроны',metall:'Металл',gifts:'Подарки',case:'Кейсы',rewards:'Награды',case_bonus:'Бонус-кейсы',skill_colt:'Colt',skill_sdpistol:'SD pistol',skill_deagle:'Deagle',skill_shotgun:'Shotgun',skill_mp5:'MP5',skill_ak47:'AK-47',skill_m4:'M4',skill_sniper_rifle:'Sniper',skill_sawnoff:'Sawn-off',skill_combat_sg:'Combat SG',skill_micro_uzi:'Micro UZI',item_id:'ID предмета',model_id:'ID модели',number:'Номер',price:'Цена',amount:'Количество / сумма',balance:'Баланс',type:'Тип',description:'Описание',admin_name:'Администратор',time:'Время',created_at:'Дата',obtained_date:'Получено',claimed_date:'Выдано',reg_time:'Дата регистрации',updated_at:'Обновлено',rent_time:'Аренда до',ban_time:'Бан (время)',unban_time:'Разбан (время)',money:'Наличные / сумма',name:'Название / ник',id:'ID'};
const playerDateKeys=new Set(['reg_time','last_login','premium_date','warn_time','rent_time','time','ban_time','unban_time','created_at','obtained_date','claimed_date','updated_at','purchased_at']);
const playerMoneyKeys=new Set(['money','bank','balance','donate','donate_total','donate_current','price','final_price','rent_price','phone_balance']);
const playerNode=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);if(cls)n.className=cls;return n;};
function playerFormat(k,v){
 if(v===null||v===undefined||v==='')return '—';
 if(playerDateKeys.has(k)&&typeof v==='number'){
  if(v<946684800 || v>4102444800)return String(v||'—');
  return new Date(v*1000).toLocaleString('ru-RU');
 }
 if(playerDateKeys.has(k)&&typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v))return v.replace('T',' ').slice(0,19);
 if(typeof v==='number')return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(v)+(playerMoneyKeys.has(k)?' ₽':'');
 return String(v);
}
function playerHideOthers(){for(const id of ['dashboardView','logsView','familyView','riskView','adminsView'])el(id).classList.add('hidden');}
function playerNavigation(){document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id==='playerNav'));}
async function showPlayers(search=''){
 logsRequest++;playerHideOthers();el('playerView').classList.remove('hidden');el('hero').classList.add('hidden');el('sectionGroup').textContent='БАЗА АККАУНТОВ';el('sectionTitle').textContent='Поиск игрока';el('sectionCaption').textContent='Профиль, имущество, финансы и журналы из игровой БД — только чтение';el('breadcrumb').textContent='Игроки / Поиск';el('timeLabel').textContent='● Авторизованный доступ';playerNavigation();setMenu(false,true);
 if(search){el('playerFind').value=String(search);await playerSearch();}
}
async function playerSearch(){
 const q=el('playerFind').value.trim(),request=++playerSearchRequest;
 if(!q){el('playerSearchStatus').textContent='Введи ник (от 2 символов) или ID аккаунта.';return;}
 el('playerSearchStatus').textContent='Поиск...';const list=el('playerSearchList');list.replaceChildren();
 try{
  const data=await api('player-search',{params:{q}});if(request!==playerSearchRequest||el('playerView').classList.contains('hidden'))return;
  list.textContent='';
  for(const p of data.rows){const b=playerNode('button',undefined,'player-result');b.type='button';const title=playerNode('strong',p.name),foot=playerNode('span',`#${p.id} · LVL ${p.level} · ${playerFormat('money',p.money)}`);b.append(title,foot);b.onclick=()=>playerSelect(p.id);if(p.id===selectedPlayer)b.classList.add('selected');list.append(b);}
  if(!data.rows.length)list.append(playerNode('p','Ничего не найдено. Попробуй точный ID или начало ника.','player-notice'));
  el('playerSearchStatus').textContent=`Найдено: ${data.rows.length} (не более 15 за запрос)`;
  if(data.rows.length===1)await playerSelect(data.rows[0].id);
 }catch(e){el('playerSearchStatus').textContent=e.message;}
}
async function playerSelect(id){
 const request=++playerRequest;selectedPlayer=Number(id);document.querySelectorAll('.player-result').forEach(b=>b.classList.toggle('selected',b.textContent.includes('#'+id+' ·')));
 el('playerEmpty').classList.add('hidden');el('playerContent').classList.remove('hidden');el('playerName').textContent='Загрузка...';el('playerStats').replaceChildren();el('playerGroups').replaceChildren();el('playerAccounts').replaceChildren();
 try{
  const data=await api('player-profile',{params:{id}});if(request!==playerRequest)return;
  el('playerName').textContent=data.player.name;el('playerMeta').textContent=`Аккаунт #${data.player.id} · Уровень ${data.player.level} · Семья: ${data.player.family_name||'нет'}`;
  const metrics=[['Наличные',playerFormat('money',data.player.money)],['Основной банк',playerFormat('bank',data.player.bank)],['BC',playerFormat('donate_current',data.player.donate_current)],['Уровень',data.player.level],['Админ',data.player.admin],['Игровых часов',data.player.totalhour]];
  el('playerStats').replaceChildren(...metrics.map(([k,v])=>{const c=playerNode('div',undefined,'player-stat');c.append(playerNode('small',k),playerNode('strong',v));return c;}));
  const groups=el('playerGroups');
  for(const [title,fields] of Object.entries(data.profileGroups)){
   const sec=playerNode('section',undefined,'player-group');sec.append(playerNode('h4',title));const grid=playerNode('dl',undefined,'player-fields');
   for(const field of fields){const pair=playerNode('div',undefined,'player-field');pair.append(playerNode('dt',playerNames[field]||field),playerNode('dd',playerFormat(field,data.player[field])));grid.append(pair);}
   sec.append(grid);groups.append(sec);
  }
  const ext=el('playerAccounts');
  const info=playerNode('div',undefined,'player-extras');info.append(playerNode('strong','Дополнительные банковские счета'));
  if(data.bankAccounts.length){for(const bank of data.bankAccounts){const line=playerNode('div',undefined,'player-extra-line');line.append(playerNode('span',`${bank.name||'Счёт'} · #${bank.id}`),playerNode('strong',playerFormat('balance',bank.balance)));info.append(line);}}
  else info.append(playerNode('p','Дополнительных счетов нет.','player-notice'));
  ext.append(info);
  const wallet=playerNode('div',undefined,'player-extras');wallet.append(playerNode('strong','Кошелёк маркетплейса'),playerNode('p',data.marketplaceWallet?playerFormat('balance',data.marketplaceWallet.balance):'Нет данных о кошельке','player-notice'));ext.append(wallet);
  if(data.player.family_name){const family=playerNode('div',undefined,'player-extras');family.append(playerNode('strong','Семья'),playerNode('p',data.player.family_name+(data.player.family_owner===data.player.id?' · лидер':'')));ext.append(family);}
  await playerChangeTab('general');
 }catch(e){if(request!==playerRequest)return;el('playerName').textContent=e.message;}
}
let playerRowsRequest=0;
function playerOptionsFor(tab){
 if(tab==='assets')return playerOptions.assets.filter(x=>!['items','legacyitems','skins','invskins','accessory','prizes','cases'].includes(x.id));
 if(tab==='inventory')return playerOptions.assets.filter(x=>['items','legacyitems','skins','invskins','accessory','prizes','cases'].includes(x.id));
 if(tab==='history')return playerOptions.histories.filter(x=>!['ban','block','tickets','payouts'].includes(x.id));
 if(tab==='punishment')return playerOptions.histories.filter(x=>['ban','block','tickets','payouts'].includes(x.id));
 return [];
}
async function playerChangeTab(tab){
 playerTab=tab;
 for(const b of document.querySelectorAll('.player-tab')){b.classList.toggle('selected',b.dataset.tab===tab);b.setAttribute('aria-selected',String(b.dataset.tab===tab));}
 el('playerGeneralPane').classList.toggle('hidden',tab!=='general');el('playerRowsPane').classList.toggle('hidden',tab==='general'||tab==='related');el('playerRelatedPane').classList.toggle('hidden',tab!=='related');
 if(!selectedPlayer)return;
 if(tab==='related'){await playerLoadRelated();return;}
 if(tab==='general')return;
 const list=playerOptionsFor(tab),select=el('playerKind');select.replaceChildren(...list.map(x=>{const o=playerNode('option',x.label);o.value=x.id;return o;}));
 if(!list.length){el('playerRowsContent').replaceChildren(playerNode('div','Нет категорий','player-notice'));return;}
 playerKind=list[0].id;playerPage=1;await playerLoadRows();
}
async function playerLoadRows(){
 if(!selectedPlayer)return;const request=++playerRowsRequest,id=selectedPlayer;
 const root=el('playerRowsContent');root.replaceChildren(playerNode('div','Загрузка записей…','player-notice'));
 try{
  const data=await api('player-rows',{params:{id,kind:playerKind,page:playerPage}});if(request!==playerRowsRequest||selectedPlayer!==id)return;
  root.textContent='';
  const table=document.createElement('table');table.className='player-record-table';table.setAttribute('aria-label',data.label);
  const thead=document.createElement('thead'),tr=document.createElement('tr');data.columns.forEach(k=>tr.append(playerNode('th',playerNames[k]||k)));thead.append(tr);
  const tbody=document.createElement('tbody');
  data.rows.forEach(row=>{const tr=document.createElement('tr');data.columns.forEach(k=>{const td=playerNode('td',playerFormat(k,row[k]));td.dataset.label=playerNames[k]||k;tr.append(td);});tbody.append(tr);});
  table.append(thead,tbody);
  if(data.rows.length)root.append(table);else root.append(playerNode('p','Записей не найдено','player-notice'));
  el('playerRowsPage').textContent=`Страница ${data.page} · ${data.rows.length} записей`;
  el('playerRowsPrev').disabled=playerPage<=1;el('playerRowsNext').disabled=!data.hasNext;
 }catch(e){if(request===playerRowsRequest)root.replaceChildren(playerNode('p',e.message,'player-notice'));}
}
async function playerLoadRelated(){
 const id=selectedPlayer,root=el('playerRelatedContent');root.replaceChildren(playerNode('p','Поиск совпадений…','player-notice'));
 try{
  const data=await api('player-related',{params:{id}});if(selectedPlayer!==id||playerTab!=='related')return;
  root.textContent='';root.append(playerNode('p',data.note,'player-related-warning'));
  for(const item of data.rows){const row=playerNode('div',undefined,'player-related-row'),label=playerNode('div',undefined,'player-related-text');label.append(playerNode('strong',`${item.name} · #${item.id}`),playerNode('span',item.matchRegistration&&item.matchLastLogin?'Совпадают IP регистрации и последнего входа':item.matchRegistration?'Совпадает IP регистрации':'Совпадает IP последнего входа'));
   const b=playerNode('button','Открыть профиль','secondary');b.type='button';b.onclick=()=>playerSelect(item.id);row.append(label,b);root.append(row);}
  if(!data.rows.length)root.append(playerNode('p','Других аккаунтов с совпадающими IP не найдено.','player-notice'));
  if(data.hasNext)root.append(playerNode('p','Показаны первые 20 совпадений.','player-notice'));
 }catch(e){root.replaceChildren(playerNode('p',e.message,'player-notice'));}
}
el('playerSearchBtn').onclick=playerSearch;
el('playerFind').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();playerSearch();}};
el('playerKind').onchange=()=>{playerKind=el('playerKind').value;playerPage=1;playerLoadRows();};
el('playerRowsPrev').onclick=()=>{if(playerPage>1){playerPage--;playerLoadRows();}};
el('playerRowsNext').onclick=()=>{if(!el('playerRowsNext').disabled){playerPage++;playerLoadRows();}};
for(const b of document.querySelectorAll('.player-tab'))b.addEventListener('click',()=>playerChangeTab(b.dataset.tab));
async function ensurePlayerConfig(){if(!playerOptions)playerOptions=await api('player-config');}
const originalPlayerTab=playerChangeTab;
playerChangeTab=async function(tab){if(!playerOptions){try{await ensurePlayerConfig();}catch(e){el('playerRowsContent').textContent=e.message;return;}}return originalPlayerTab(tab);};
