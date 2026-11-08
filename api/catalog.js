'use strict';
// Whitelisted columns from the 2026-11-08 VAYNORIX MariaDB dump. Never use client-supplied identifiers.
const rows = [
 ['action','Админ-действия','Модерация','action_log','id','time','unix','acc_id','id acc_id type description uip time','description'],
 ['aclogs','Античит','Модерация','aclogs','id','','','', 'id type date name reason data','name reason data'],
 ['ban','Блокировки','Модерация','ban_list','id','time','unix','user_id','id user_id admin description ip time ban_time','admin description'],
 ['bans','Блок-лист','Модерация','listban','acc_id','ban_time','unix','acc_id','acc_id player_name admin_name reason ban_time unban_time','player_name admin_name reason'],
 ['money','Денежные операции','Экономика','money_log','id','time','unix','uid','id uid money description uip time','description'],
 ['donate','Донат / BC','Экономика','donate_log','id','time','unix','uid','id uid donate description uip time','description'],
 ['bank','Банковские операции','Экономика','bank_accounts_log','id','time','unix','BANK','id acc_id description uip time','description'],
 ['business','Доходы бизнесов','Экономика','business_profit','id','time','unix','uid','id bid uid money time uip',''],
 ['fuel','Прибыль АЗС','Экономика','fuel_stations_profit','id','time','unix','uid','id fid uid money time uip',''],
 ['compensations','Компенсации','Экономика','return_money','id','','','uid','id uid money description status','description'],
 ['auctions','Ставки аукционов','Сделки','auction_bids','id','created_at','unix','bidder_account_id','id auction_id bidder_account_id bidder_name amount status created_at','bidder_name status'],
 ['auction_history','История аукционов','Сделки','auction_history','id','completed_at','unix','buyer_account_id','id auction_id business_id seller_account_id buyer_account_id final_price result completed_at','result'],
 ['marketplace','Маркетплейс','Сделки','marketplace_history','id','created_at','unix','account_id','id account_id seller_name buyer_name item_name amount price status created_at','seller_name buyer_name item_name'],
 ['promo','Промокоды','Награды','activated_promos','id','activated_at','datetime','account_id','id account_id promo_id activated_at',''],
 ['promo_old','Старые промокоды','Награды','promocode_activations','id','','','uid','id uid code paydays uip','code'],
 ['blackpass','BlackPass','Награды','blackpass_logs','id','created_at','unix','account_id','id account_id season_number action reward_type reward_value amount created_at','action'],
 ['families','Семьи','Сообщество','family_log','id','time','unix','','id family player to_player text type time','text'],
 ['admin_online','Онлайн администрации','Сообщество','admin_stats_online','stat_date','stat_date','date','account_id','account_id stat_date seconds',''],
 ['debug','Системные логи','Система','debug','id','','','','id text date','text']
];
const catalog = Object.fromEntries(rows.map(([id,title,group,table,order,time,mode,account,cols,search]) => [id,{id,title,group,table,order,time,mode,account,columns:cols.split(' '),search:search?search.split(' '):[]} ]));
module.exports = catalog;