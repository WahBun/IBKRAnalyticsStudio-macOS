import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the production calendar renderer without starting refresh or loading a user report.
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/\napplyTheme\(\);[\s\S]*?\nmaybeAutoCheckForUpdates\(\);/, '');
const context = { Intl, localStorage: { getItem: () => null }, document: {
  documentElement: { lang: 'en' }, querySelector: () => null
} };
vm.createContext(context);
vm.runInContext(app, context);
const coverage = {start: '2026-11-02', end: '2026-11-11'};
const rows = [{day: 3, tradeCount: 1, realizedPL: 0}, {day: 11, tradeCount: 1, realizedPL: null}];
const html = context.renderProfitCalendar(rows, '2026-11', 'USD', '2026-11-10', coverage);
assert.deepEqual([...html.matchAll(/<span>(Mon|Tue|Wed|Thu|Fri)<\/span>/g)].map(match => match[1]), ['Mon','Tue','Wed','Thu','Fri']);
const dates = [...html.matchAll(/class="calendar-day">(\d+)</g)].map(match => +match[1]);
assert.deepEqual(dates, [2,3,4,5,6,9,10,11,12,13,16,17,18,19,20,23,24,25,26,27,30]);
assert.match(html, /data-calendar-date="2026-11-10"[^>]+aria-pressed="true"[^>]*>\s*<span[^>]*>10<\/span>\s*<strong[^>]*>—</);
assert.match(html, /class="calendar-day">3<\/span>\s*<strong[^>]*>0(?:\.0+)?</);
assert.match(html, /class="calendar-day">11<\/span>\s*<strong[^>]*>—</);
assert.doesNotMatch(html, /data-calendar-date="2026-11-12"/);
const leap = context.renderProfitCalendar([], '2028-02', 'USD', '', {});
assert.match(leap, /class="profit-calendar">\s*<div class="calendar-cell is-empty"[^>]*><\/div>\s*<div class="calendar-cell"/);
assert.match(leap, /class="calendar-day">29</);
console.log('Weekday grid, report coverage, inactive and breakeven days, unknown values and leap month passed.');

const { parseIbkrReport } = await import('../src/parser.js');
const { easternDay } = await import('../src/refreshSchedule.js');
context.easternDay = easternDay;
const report = parseIbkrReport(`BOF,TEST,Test,1,20251229,20251231
BOF,TEST,Test,1,20261101,20261116
BOS,ACCT,Account Information
HEADER,ACCT,ClientAccountID,DateOpened,CurrencyPrimary
DATA,ACCT,TEST,20240115,USD
BOS,TRNT,Trades
HEADER,TRNT,ClientAccountID,Symbol,UnderlyingSymbol,LevelOfDetail,AssetClass,CurrencyPrimary,TradeDate,Quantity,IBCommission,IBCommissionCurrency,FifoPnlRealized,FXRateToBase
DATA,TRNT,TEST,ABC,,ORDER,STK,USD,20251230,1,-1,USD,12,1
DATA,TRNT,TEST,ABC261120C00011000,ABC,ORDER,OPT,USD,20261110,1,-2,USD,-5,1
DATA,TRNT,TEST,XYZ,,ORDER,STK,CAD,20261111,1,0.25,USD,8,0.75
DATA,TRNT,TEST,NO-PNL,,ORDER,STK,CAD,20261112,1,-0.50,CAD,,0.75
EOF`);
assert.deepEqual(report.reviewCoverage, [
  { start: '2025-12-29', end: '2025-12-31' },
  { start: '2026-11-01', end: '2026-11-16' }
]);
assert.equal(report.accountInfo.opened, '2024-01-15');
vm.runInContext('state.dailyScope = "all"; state.dailyCurrency = "USD"', context);
const all = context.renderDailyStats(report);
assert.match(all, /data-review-period="2025"/);
assert.match(all, /data-review-period="2026"/);
assert.match(all, /Account opened 2024-01-15/);
assert.match(all, /\+[^<]*7\.00/);
assert.match(all, /2\.75/);  // Includes the commission credit on the CAD trade.
vm.runInContext('state.dailyScope = "year"; state.dailyYear = "2026"; state.dailyCurrency = "CAD"', context);
const annual = context.renderDailyStats(report);
assert.equal((annual.match(/data-review-period=/g) || []).length, 1);
assert.match(annual, /2026-11 · —/); // An unreported realized amount invalidates the bucket.
assert.doesNotMatch(annual, /2025-12-29|Account opened/);
console.log('Annual and all-time scopes, separate coverage, selected currency and missing P&L passed.');
