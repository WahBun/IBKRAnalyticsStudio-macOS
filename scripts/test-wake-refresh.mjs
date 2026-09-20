import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { automaticRefreshDay } from '../src/refreshSchedule.js';

let now = Date.parse('2026-09-09T11:00:00Z');
let calls = 0;
let tick;
const timers = [];
const events = {};
const storage = new Map();
const context = {
  Date: class extends Date {
    constructor() { super(now); }
    static now() { return now; }
  },
  URLSearchParams, location: { search: '' }, navigator: { onLine: true },
  state: { flexToken: 'test', flexQueryId: 'test', data: {}, flexBusy: false, backgroundRefreshBusy: false },
  canUseNativeFlex: () => true, normalizeFlexQueryId: value => value, automaticRefreshDay,
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  window: {
    setTimeout: (fn, delay) => timers.push({ fn, at: now + delay }),
    setInterval: fn => { tick = fn; },
    addEventListener: (name, fn) => { events[name] = fn; }
  },
  document: { hidden: false, addEventListener: (name, fn) => { events[name] = fn; } },
  requestFlexReport: () => { calls++; }
};
const source = fs.readFileSync('src/app.js', 'utf8');
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function flexScheduleKey('), source.indexOf('async function openFlexCacheDb(')), context);
const advance = ms => {
  now += ms;
  const ready = timers.filter(timer => timer.at <= now);
  ready.forEach(timer => timers.splice(timers.indexOf(timer), 1));
  ready.forEach(timer => timer.fn());
};
context.startAutomaticFlexRefresh();
assert.equal(calls, 0);
advance(15_000);
assert.equal(calls, 1);
tick(); events.focus();
assert.equal(calls, 1);
context.recordFlexSchedule('networkFailed', '2026-09-09');
now += 3_600_000;
tick();
assert.equal(calls, 1);
advance(15_000); tick();
assert.equal(calls, 2);
context.recordFlexSchedule('networkFailed', '2026-09-09');
events.online(); advance(15_000);
assert.equal(calls, 2);
context.startAutomaticFlexRefresh(); advance(15_000);
assert.equal(calls, 2);
now = Date.parse('2026-09-10T11:00:00Z');
context.navigator.onLine = false;
tick(); advance(30_000); tick();
assert.equal(calls, 2);
context.navigator.onLine = true;
events.online(); advance(15_000);
assert.equal(calls, 3);
console.log('Scheduler integration passed: startup delay, sleep gap, recovery limit, relaunch, offline and reconnect.');
