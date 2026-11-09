'use strict';
let overviewRequest=0;
const overviewNumber=value=>{
 try{return new Intl.NumberFormat('ru-RU').format(BigInt(value));}
 catch{return '—';}
};
function overviewRow(item,total){
 const section=document.createElement('div');section.className='overview-balance-row';
 const top=document.createElement('div');top.className='overview-balance-top';
 const name=document.createElement('span');name.textContent=item.label;
 const amount=document.createElement('strong');amount.textContent=overviewNumber(item.amount)+' ₽';top.append(name,amount);
 const progress=document.createElement('div');progress.className='overview-progress';
 const bar=document.createElement('span');let percent=0;
 try{let n=BigInt(item.amount),t=BigInt(total);if(t>0n&&n>0n)percent=Number(n*1000n/t)/10;}catch{}
 bar.style.width=Math.max(0,Math.min(100,percent))+'%';
 progress.append(bar);section.append(top,progress);return section;
}
async function showDashboard(){
 logsRequest++;
 for(const id of ['logsView','familyView','riskView','adminsView'])el(id).classList.add('hidden');
 el('dashboardView').classList.remove('hidden');el('hero').classList.add('hidden');
 el('sectionTitle').textContent='Обзор сервера';el('sectionGroup').textContent='МОНИТОРИНГ';
 el('sectionCaption').textContent='Онлайн, аккаунты и деньги на сервере — из игровой MariaDB';
 el('breadcrumb').textContent='Мониторинг / Обзор сервера';el('timeLabel').textContent='● Только чтение';
 document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id==='dashboardNav'));
 setMenu(false,true);await loadOverview();
}
async function loadOverview(){
 const request=++overviewRequest,button=el('overviewRefresh');
 button.disabled=true;button.textContent='Обновляем…';
 el('overviewError').classList.add('hidden');el('overviewUpdated').textContent='Запрос к серверу…';
 try{
  const data=await api('server-overview');
  if(request!==overviewRequest||el('dashboardView').classList.contains('hidden'))return;
  el('overviewMoney').textContent=overviewNumber(data.totalMoney);
  el('overviewOnline').textContent=overviewNumber(data.online);
  el('overviewAccounts').textContent=overviewNumber(data.accounts);
  el('overviewMoneyNote').textContent=data.moneyNote;el('overviewOnlineNote').textContent=data.onlineDisclaimer;
  el('overviewBreakdown').replaceChildren(...data.breakdown.map(x=>overviewRow(x,data.totalMoney)));
  const updated=new Date(data.sampledAt);
  el('overviewUpdated').textContent='Обновлено: '+(Number.isNaN(updated.getTime())?'сейчас':updated.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
 }catch(error){
  if(request!==overviewRequest||el('dashboardView').classList.contains('hidden'))return;
  el('overviewUpdated').textContent='Данные временно недоступны';
  el('overviewError').textContent=error.message;el('overviewError').classList.remove('hidden');
 }finally{if(request===overviewRequest){button.disabled=false;button.textContent='↻ Обновить';}}
}
el('overviewRefresh').addEventListener('click',loadOverview);
setInterval(()=>{if(user&&!el('dashboardView').classList.contains('hidden')&&!el('overviewRefresh').disabled)loadOverview();},60000);
