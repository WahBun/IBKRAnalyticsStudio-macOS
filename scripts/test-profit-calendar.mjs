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
