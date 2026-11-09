'use strict';
// Accessible navigation/theme enhancements. No credentials, player data or SQL are persisted.
(function(){
 const root=document.documentElement;
 const themeButton=document.getElementById('themeSwitch');
 const themeText=document.getElementById('themeSwitchText');
 function setTheme(theme){
  const value=theme==='light'?'light':'dark';root.dataset.theme=value;
  if(themeText)themeText.textContent=value==='light'?'Светлая':'Тёмная';
  themeButton?.setAttribute('aria-label',value==='light'?'Включить тёмную тему':'Включить светлую тему');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',value==='light'?'#f9fcfb':'#0c171b');
  try{localStorage.setItem('vaynorix_theme',value);}catch{}
 }
 setTheme(root.dataset.theme);
 themeButton?.addEventListener('click',()=>setTheme(root.dataset.theme==='light'?'dark':'light'));
 const tabs=document.getElementById('topTabs');
 const targets={dashboard:'dashboardNav',risk:'riskNav',player:'playerNav',family:'familyNav'};
 let raf=false;
 function syncTabs(){
  if(raf)return;raf=true;
  requestAnimationFrame(()=>{raf=false;
   const activeNav=document.querySelector('#navigation .nav-item.active');
   const section=activeNav?.dataset.section||'';
   const target=Object.entries(targets).find(([,id])=>id===activeNav?.id)?.[0]||(section?'money':'dashboard');
   for(const tab of tabs?.querySelectorAll('.top-tab')||[]){const yes=tab.dataset.view===target;tab.classList.toggle('active',yes);if(yes)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
  });
 }
 tabs?.addEventListener('click',event=>{
  const tab=event.target.closest('button[data-view]');if(!tab)return;
  const kind=tab.dataset.view;
  if(kind==='dashboard')showDashboard();else if(kind==='risk')showRisk();else if(kind==='player')showPlayers();else if(kind==='family')showFamilies();else if(kind==='money')switchLog('money');
  syncTabs();
 });
 const sidebar=document.getElementById('navigation');
 if(sidebar)new MutationObserver(syncTabs).observe(sidebar,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
 syncTabs();
 const quickForm=document.getElementById('quickSearchForm'),quick=document.getElementById('quickSearch');
 quickForm?.addEventListener('submit',async event=>{
  event.preventDefault();const q=quick.value.trim();if(!q)return;
  if(!document.getElementById('shell').classList.contains('hidden'))await showPlayers(q);
  quick.blur();
 });
 document.addEventListener('keydown',event=>{
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
  if(event.key==='/'&&!typing&&document.getElementById('shell')&&!document.getElementById('shell').classList.contains('hidden')){event.preventDefault();if(getComputedStyle(quickForm).display==='none'){showPlayers();document.getElementById('playerFind')?.focus();}else quick?.focus();}
 });
 const high=document.getElementById('riskHigh'),badge=document.getElementById('riskCountBadge');
 if(high&&badge)new MutationObserver(()=>{
  const value=parseInt((high.textContent||'').replace(/\D/g,''),10);
  if(Number.isFinite(value)&&value>0){badge.hidden=false;badge.textContent=String(Math.min(99,value))+(value>99?'+':'');}
  else{badge.hidden=true;badge.textContent='';}
 }).observe(high,{childList:true,characterData:true,subtree:true});
})();
