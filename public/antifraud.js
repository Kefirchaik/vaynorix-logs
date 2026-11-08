'use strict';
// Read-only antifraud console. Findings never trigger sanctions.
let riskCases=[],riskRequest=0;
const riskType={
 possible_multi_registration:'Возможен мультиаккаунт · IP регистрации',
 possible_multi_last:'Возможен мультиаккаунт · последний IP',
 large_credit:'Крупное начисление',
 repeated_credit:'Серия начислений',
 possible_related_flow:'Возможный перевод на связанный аккаунт',
 large_balance:'Крупный баланс'
};
const riskSeverity={high:'Приоритетная проверка',medium:'Проверить',info:'Возможная связь'};
const riskNum=x=>Number(x||0).toLocaleString('ru-RU');
function riskNode(tag,content,cls){const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(cls)n.className=cls;return n;}
async function showRisk(){
 logsRequest++;el('logsView').classList.add('hidden');el('familyView').classList.add('hidden');el('adminsView').classList.add('hidden');el('riskView').classList.remove('hidden');el('hero').classList.add('hidden');
 el('sectionTitle').textContent='Антифрод · Проверка рисков';el('sectionGroup').textContent='БЕЗОПАСНОСТЬ';
 el('sectionCaption').textContent='Подозрительные операции и вероятные связи между аккаунтами — только чтение';
 el('breadcrumb').textContent='Безопасность / Антифрод';
 document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id==='riskNav'));
 setMenu(false,true);await loadRisk();
}
function showRiskCards(){
 const q=el('riskSearch').value.trim().toLowerCase(),severity=el('riskLevel').value;
 const filtered=riskCases.filter(c=>(!severity||c.severity===severity)&&(!q||[c.title,c.reason,c.type,...(c.players||[]).flatMap(p=>[p.name,String(p.id)])].join(' ').toLowerCase().includes(q)));
 const parent=el('riskList');parent.textContent='';
 for(const c of filtered){
  const card=riskNode('article',undefined,'risk-card risk-'+c.severity);
  const head=riskNode('div',undefined,'risk-card-head');
  const title=riskNode('div',undefined,'risk-card-title');title.append(riskNode('strong',riskType[c.type]||c.title),riskNode('span',riskSeverity[c.severity], 'risk-mark risk-mark-'+c.severity));head.append(title);
  if(c.amount)head.append(riskNode('b',riskNum(c.amount)+' ₽','risk-amount'));
  const reason=riskNode('p',c.reason,'risk-reason');card.append(head,reason);
  const peers=riskNode('div',undefined,'risk-players');
  for(const p of (c.players||[])){
   const b=riskNode('button',`${p.name} · #${p.id}`,'risk-player');b.type='button';b.title='Открыть денежный журнал аккаунта';
   b.addEventListener('click',async()=>{await switchLog('money');el('account').value=String(p.id);page=1;await load();});peers.append(b);
  }
  card.append(peers);
  const meta=riskNode('div',undefined,'risk-meta');
  if(c.time)meta.append(riskNode('span',new Date(c.time*1000).toLocaleString('ru-RU')));
  if(c.logId)meta.append(riskNode('span',`money_log #${c.logId}`));
  if(c.relatedLogId)meta.append(riskNode('span',`сопоставлено с #${c.relatedLogId}`));
  if(c.count)meta.append(riskNode('span',`Совпадений: ${c.count}`));
  card.append(meta);parent.append(card);
 }
 if(!filtered.length)parent.append(riskNode('div','По этим фильтрам сигналов нет. Это не означает, что риск отсутствует.','risk-empty'));
 el('riskShown').textContent=`Показано: ${filtered.length} из ${riskCases.length}`;
}
async function loadRisk(){
 const request=++riskRequest;el('riskStatus').textContent='Анализируем последние записи…';el('riskRefresh').disabled=true;
 try{
  const response=await api('risk-overview',{params:{days:el('riskDays').value,minimum:el('riskMinimum').value}});
  if(request!==riskRequest||el('riskView').classList.contains('hidden'))return;
  riskCases=response.cases||[];el('riskHigh').textContent=riskNum(response.summary.high);el('riskMedium').textContent=riskNum(response.summary.medium);el('riskMulti').textContent=riskNum(response.summary.possibleMulti);el('riskTotal').textContent=riskNum(response.summary.total);
  const c=response.coverage||{};
  el('riskStatus').textContent=`Обработано до ${riskNum(c.moneySample)} операций и ${riskNum(c.accountSample)} аккаунтов. ${c.moneyLimited||c.accountsLimited?'Выборка ограничена последними записями.':'Поиск по выбранному периоду в доступной выборке.'}`;
  el('riskDisclaimer').textContent=response.disclaimer||'';
  showRiskCards();
 }catch(e){if(request===riskRequest){el('riskStatus').textContent='Ошибка анализа: '+e.message;el('riskList').replaceChildren(riskNode('div','Не удалось прочитать данные. Проверь подключение к БД.','risk-empty'));}}
 finally{if(request===riskRequest)el('riskRefresh').disabled=false;}
}
el('riskRefresh').addEventListener('click',loadRisk);
el('riskDays').addEventListener('change',loadRisk);
el('riskMinimum').addEventListener('change',loadRisk);
el('riskSearch').addEventListener('input',showRiskCards);
el('riskLevel').addEventListener('change',showRiskCards);