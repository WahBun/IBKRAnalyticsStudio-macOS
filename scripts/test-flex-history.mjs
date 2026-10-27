import assert from 'node:assert/strict';
import { mergeFlexHistory } from '../src/flexHistory.js';
import { parseIbkrReport } from '../src/parser.js';
const report = (start, end, days, position = true) => `BOF,TEST,Test,1,${start},${end}
BOS,ACCT,Account
HEADER,ACCT,ClientAccountID,CurrencyPrimary
DATA,ACCT,TEST-A,USD
BOS,EQUT,Equity Summary
HEADER,EQUT,ClientAccountID,CurrencyPrimary,ReportDate,Cash,Total
${days.map(d => `DATA,EQUT,TEST-A,USD,${d},100,100`).join('\n')}
BOS,CNAV,Change in NAV
HEADER,CNAV,ClientAccountID,CurrencyPrimary,FromDate,ToDate,TWR,EndingValue
${days.map(d => `DATA,CNAV,TEST-A,USD,${d},${d},1,100`).join('\n')}
BOS,TRNT,Trades
HEADER,TRNT,ClientAccountID,AssetClass,Symbol,TradeDate,Quantity,TradePrice,Proceeds,LevelOfDetail,Model
${days.map(d => `DATA,TRNT,TEST-A,STK,AAA,${d},1,10,-10,ORDER,`).join('\n')}
BOS,POST,Open Positions
HEADER,POST,ClientAccountID,AssetClass,Symbol,ReportDate,Position,MarkPrice,PositionValue,LevelOfDetail,CurrencyPrimary
${position ? `DATA,POST,TEST-A,STK,AAA,${end},1,10,10,SUMMARY,USD` : ''}
EOF`;
const old = report('20251020','20261026',['20251020','20251021','20261026']);
const next = report('20251028','20261027',['20261026','20261027'],false);
const merged = mergeFlexHistory(old,next);
const parsed = parseIbkrReport(merged);
assert.equal(parsed.reportScope.start,'2025-10-20');
assert.equal(parsed.reportScope.end,'2026-10-27');
assert.equal(parsed.tradeDetails.length,4);
assert.equal(parsed.navHistory.length,4);
assert.equal(parsed.positions.length,0,'Closed position must not be resurrected from history');
assert.equal(mergeFlexHistory(merged,next),merged,'Retry must not duplicate archived rows');
assert.equal(parseIbkrReport(mergeFlexHistory(merged,report('20261027','20271026',['20261027','20271026']))).tradeDetails.length,5);
assert.throws(()=>mergeFlexHistory(old,next.replaceAll('TEST-A','TEST-B')),/missing account/);
assert.throws(()=>mergeFlexHistory(old,next.replace(/^DATA,TRNT.*20261026.*\n/m,'')),/omits/);
assert.throws(()=>mergeFlexHistory(old,next.replace(/^DATA,EQUT.*20261026.*\n/m,'')),/daily account history/);
assert.throws(()=>mergeFlexHistory(old,report('20271027','20281026',['20281026'])),/gap/);
assert.throws(()=>mergeFlexHistory(old,report('20251021','20261025',['20251021'])),/earlier/);
const revised = next.replace('20261026,1,10,-10','20261026,2,10,-20');
assert.equal(parseIbkrReport(mergeFlexHistory(old,revised)).tradeDetails.length,4);
const schemaChange = next.replace('LevelOfDetail,Model','Model,LevelOfDetail').replaceAll(',ORDER,',',,ORDER');
assert.equal(parseIbkrReport(mergeFlexHistory(old,schemaChange)).tradeDetails.length,4);
const duplicateTrades = old.replace('DATA,TRNT,TEST-A,STK,AAA,20251020,1,10,-10,ORDER,','DATA,TRNT,TEST-A,STK,AAA,20251020,1,10,-10,ORDER,\nDATA,TRNT,TEST-A,STK,AAA,20251020,1,10,-10,ORDER,');
assert.equal(parseIbkrReport(mergeFlexHistory(duplicateTrades,next)).tradeDetails.length,5);
console.log('Rolling history, multi-year persistence, retries, snapshot removal, overlap corrections, schema changes and fail-closed integrity passed.');

// Exercise the actual refresh callback, including durable-save failure and relaunch.
const { default: fs } = await import('node:fs');
const { default: vm } = await import('node:vm');
const { flexRequestRange } = await import('../src/flexRequest.js');
const source = fs.readFileSync('src/app.js','utf8');
async function refresh(saveSucceeds) {
  const initial = parseIbkrReport(old);
  let persisted, shown, succeeded = false;
  const context = {
    Date, Math, String,
    state: {data:initial,reportText:old,flexToken:'test',flexQueryId:'test'},
    canUseNativeFlex:()=>true, canUseTauriBridge:()=>true,
    normalizeFlexToken:x=>x,normalizeFlexQueryId:x=>x,
    flexRequestRange, flexScheduleKey:()=>'', easternDay:()=>({date:'2026-10-28'}),
    updateFlexRefreshUi:()=>{},renderUpload:()=>{},renderDashboard:()=>{},
    parseIbkrReport,flexResponseIssue:()=>'',mergeFlexHistory,
    fingerprintReportText:x=>x,formatDateTime:x=>x,fetchBenchmark:()=>{},
    flexRefreshFailureStatus:x=>x,DEFAULT_REPORT_TAB:'daily',
    writeCachedFlexReport:async entry=>{if(saveSucceeds) persisted=entry;return saveSucceeds;},
    recordFlexSchedule:kind=>{if(kind==='succeeded')succeeded=true;},
    parseText:text=>{assert.ok(persisted,'Durable archive precedes display');shown=parseIbkrReport(text);return true;},
    getTauriInvoke:()=>async()=>({reportText:next,referenceCode:'test'})
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function requestFlexReport('),source.indexOf('function flexRefreshFailureStatus(')),context);
  context.requestFlexReport({background:true});
  await new Promise(resolve=>setImmediate(resolve));
  if(saveSucceeds){
    assert.ok(succeeded);assert.equal(shown.tradeDetails.length,4);
    const relaunched=parseIbkrReport(persisted.text);
    assert.equal(relaunched.reportScope.start,'2025-10-20');assert.equal(relaunched.tradeDetails.length,4);
  } else {
    assert.equal(shown,undefined);assert.equal(succeeded,false);
    assert.equal(context.state.data,initial);assert.match(context.state.flexStatus,/Could not save/);
  }
}
await refresh(true);await refresh(false);
console.log('Actual refresh callback: save-before-display, cache restoration and storage-failure retention passed.');
