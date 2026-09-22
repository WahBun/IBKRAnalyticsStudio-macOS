import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/app.js', 'utf8')
  .replace(/^import .*;$/gm, '')
  .replace('applyTheme();\napplyLanguage();\nrender();\nhydrateCachedFlexReport().finally(startAutomaticFlexRefresh);\nmaybeAutoCheckForUpdates();', '');
const context = { Intl, URLSearchParams, localStorage: { getItem: () => null },
  document: { querySelector: () => null, documentElement: { lang: 'en' } } };
vm.createContext(context);
vm.runInContext(source, context);
const benchmarks = Object.fromEntries(['sp500', 'nq100'].map(key => [key, JSON.parse(fs.readFileSync(`assets/benchmarks/${key}.json`, 'utf8'))]));
const rows = benchmarks.nq100.dates.filter(date => date >= '2026-01-02' && date <= '2026-05-15')
  .map((date, index) => ({ date, nav: 10000, returnRate: Math.sin(index / 12) * 4, flowAdjusted: true }));
assert.equal(vm.runInContext('state.benchmarkSelection', context), 'both');
for (const mode of ['none', 'sp500', 'nq100', 'both']) {
  const html = context.renderReturnCurve({ nav: { total: 10000 } }, 'USD', benchmarks, { rows, isReliable: true }, mode);
  assert.equal(html.includes('data-benchmark="sp500"'), ['sp500', 'both'].includes(mode));
  assert.equal(html.includes('data-benchmark="nq100"'), ['nq100', 'both'].includes(mode));
  assert.ok(!html.includes('NaN'));
  if (mode === 'both') {
    fs.mkdirSync('outputs', { recursive: true });
    fs.writeFileSync('outputs/benchmark-test.html', `<html data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/styles.css"></head><body><main style="max-width:850px;margin:30px auto">${html}</main><script type="module">${source}\nbindReturnCurveHover();</script></body></html>`);
  }
}
const aligned = context.buildBenchmarkRows({ dates: ['2026-01-02','2026-01-05'], closes: [100,110] }, [
  {date:'2026-01-02'}, {date:'2026-01-05'}, {date:'2026-01-06'}]);
assert.equal(aligned.length, 2);
assert.ok(Math.abs(aligned[1].returnRate - 10) < 1e-10);
console.log('Benchmark modes, default, alignment, stale-data cutoff and returns passed.');

const history = { symbol: 'sp500', dates: ['2026-09-04', '2026-09-16'], closes: [100, 110] };
const older = { symbol: 'sp500', dates: ['2026-09-03', '2026-09-04'], closes: [98, 99] };
const merged = context.mergeBenchmarkHistory(older, history, 'sp500');
assert.equal(merged.dates.at(-1), '2026-09-16');
assert.equal(merged.closes[1], 100);
assert.equal(context.isBenchmarkResponseForSelection({ ...history, closes: [100] }, 'sp500'), false);
assert.equal(context.isBenchmarkResponseForSelection({ ...history, closes: [100, NaN] }, 'sp500'), false);
assert.equal(context.isBenchmarkResponseForSelection({ ...history, symbol: 'nq100' }, 'sp500'), false);
assert.equal(context.mergeBenchmarkHistory(history, null, 'sp500').dates.at(-1), '2026-09-16');
assert.ok(benchmarks.sp500.dates.at(-1) >= '2026-09-16');
console.log('History retention, source priority, invalid-data rejection and September SPX coverage passed.');

let nativeCalls = 0;
const cache = new Map();
context.localStorage = { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) };
context.withTimeout = promise => promise;
context.fetch = async () => ({ ok: true, json: async () => older });
context.window = { __TAURI__: { core: { invoke: async () => { nativeCalls++; return history; } } } };
const fetched = await context.fetchBenchmarkJson('proxy', 'sp500', '2026-09-04', '2026-09-16');
assert.equal(nativeCalls, 1);
assert.equal(fetched.dates.at(-1), '2026-09-16');
assert.ok(cache.has('ibkr-benchmark-history:sp500'));
context.fetch = async () => { throw Error('offline'); };
const offline = await context.fetchLocalSp500Benchmark('sp500');
assert.equal(offline.dates.at(-1), '2026-09-16');
console.log('Native-first refresh, persistence and offline restoration passed.');

const retryTimers = new Map();
let timerId = 0;
context.window.setTimeout = (fn, delay) => { retryTimers.set(++timerId, { fn, delay }); return timerId; };
context.window.clearTimeout = id => retryTimers.delete(id);
context.fetchLocalSp500Benchmark = async symbol => ({ ...history, symbol });
context.fetchBenchmarkJson = async (url, symbol) => ({ ...history, symbol });
vm.runInContext(`state.activeTab = 'daily'; state.benchmarkSelection = 'both'; state.data = {
  navHistory: [{date:'2026-09-04',flowAdjusted:true}, {date:'2026-09-21',flowAdjusted:true}]
};`, context);
await context.fetchBenchmark();
assert.equal(retryTimers.size, 1);
assert.equal([...retryTimers.values()][0].delay, 30 * 60 * 1000);
context.fetchBenchmarkJson = async (url, symbol) => ({ symbol, dates: ['2026-09-04', '2026-09-21'], closes: [100, 115] });
await context.fetchBenchmark();
assert.equal(retryTimers.size, 0);
const staleHtml = context.renderReturnCurve({nav:{total:10000}}, 'USD', {sp500:history}, {
  isReliable:true, rows:[{date:'2026-09-04',returnRate:0,nav:10000},{date:'2026-09-16',returnRate:1,nav:10100},{date:'2026-09-21',returnRate:2,nav:10200}]
}, 'sp500');
assert.ok(staleHtml.includes('2026-09-16)'));
console.log('Stale benchmark date disclosure, delayed retry and stop-when-current passed.');
