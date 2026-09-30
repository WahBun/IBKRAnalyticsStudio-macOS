import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

function load(source) {
  const context = { Intl, URLSearchParams, localStorage: { getItem: () => null },
    document: { querySelector: () => null, documentElement: { lang: 'en' } } };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import .*;$/gm, '').replace(
    'applyTheme();\napplyLanguage();\nrender();\nhydrateCachedFlexReport().finally(startAutomaticFlexRefresh);\nmaybeAutoCheckForUpdates();', ''), context);
  return context;
}
const current = load(fs.readFileSync('src/app.js', 'utf8'));
const previous = load(execFileSync('git', ['show', 'HEAD:src/app.js'], { encoding: 'utf8' }));
const tradeDetails = Array.from({ length: 12000 }, (_, i) => ({
  symbol: i % 2 ? 'TSLL 260918P00009000' : 'CRCL', baseSymbol: i % 2 ? 'TSLL' : 'CRCL',
  date: `2026-${String(i % 12 + 1).padStart(2, '0')}-15`,
  month: `2026-${String(i % 12 + 1).padStart(2, '0')}`,
  dateTime: `2026-${String(i % 12 + 1).padStart(2, '0')}-15T12:00:00`,
  side: 'Buy', currency: 'USD', grossValue: 100, commission: -1, realizedPL: i % 10
}));
const data = { tradeDetails, dailyTradeStats: current.summarizeDailyTradeRows(tradeDetails),
  accountInfo: {}, tradeSummary: {}, baseCurrency: 'USD' };
for (const query of ['', 'TSLL', '2026-02', 'no-match']) {
  for (const context of [current, previous]) vm.runInContext(`state.search = ${JSON.stringify(query)}`, context);
  for (const month of ['2026-02', '2026-12']) {
    for (const context of [current, previous]) vm.runInContext(`state.dailyMonth = '${month}'; state.dailySelectedDate = '${month}-15'`, context);
    assert.equal(current.renderDailyStats(data), previous.renderDailyStats(data));
  }
}
vm.runInContext("state.search = 'TSLL'", current);
const cached = current.dailyView(data);
assert.equal(current.dailyView(data), cached);
assert.notEqual(current.dailyView({ ...data }), cached);
current.document.documentElement.lang = 'zh';
assert.notEqual(current.dailyView(data), cached);
vm.runInContext("state.search = ''", current);
assert.equal(current.dailyView(data).tradesByMonth.get('2026-02').length, 1000);
for (const context of [current, previous]) vm.runInContext("state.search = 'TSLL'", context);
// Measure identical repeated daily renders, including table formatting and HTML generation.
for (const [name, context] of [['before', previous], ['after', current]]) {
  context.renderDailyStats(data);
  const start = performance.now();
  for (let i = 0; i < 10; i++) context.renderDailyStats(data);
  console.log(`${name}: ${((performance.now() - start) / 10).toFixed(1)} ms/render (12,000 trades)`);
}
console.log('Daily output parity, query changes, report replacement and locale invalidation passed.');

const events = new Map();
const frames = new Map();
let frameId = 0;
let tooltipWrites = 0;
const element = () => ({ style: {}, classList: { add() {}, remove() {} },
  setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 680, height: 250 }) });
const tooltip = element();
Object.defineProperty(tooltip, 'innerHTML', { set() { tooltipWrites++; } });
const chart = { ...element(), isConnected: true,
  dataset: { returnPoints: JSON.stringify([0, 1, 2].map(i => ({ date: '2026-09-25',
    portfolioX: i * 100, portfolioY: 50, portfolioReturn: i, benchmarks: [] }))) },
  querySelector: selector => selector === '.return-hover-tooltip' ? tooltip : element(),
  querySelectorAll: () => [], addEventListener: (name, handler) => events.set(name, handler) };
current.document.querySelector = () => chart;
current.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
current.cancelAnimationFrame = id => frames.delete(id);
current.bindReturnCurveHover();
events.get('pointerenter')({ clientX: 50 });
assert.equal(tooltipWrites, 1, 'Initial tooltip is immediate');
for (let i = 0; i < 100; i++) events.get('pointermove')({ clientX: i });
assert.equal(frames.size, 1, 'Mouse events coalesce into one frame');
const pending = [...frames.values()][0];
frames.clear();
pending();
assert.equal(tooltipWrites, 2);
events.get('pointermove')({ clientX: 150 });
events.get('pointerleave')();
assert.equal(frames.size, 0, 'Leaving cancels pending tooltip work');
console.log('Immediate hover, frame coalescing and leave cancellation passed.');
