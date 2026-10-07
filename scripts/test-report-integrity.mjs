import assert from 'node:assert/strict';
import { parseIbkrReport } from '../src/parser.js';
import { reportReplacementIssue } from '../src/reportIntegrity.js';

const csv = `BOF,TEST,Test,1,20260901,20261006
BOS,ACCT,Account
HEADER,ACCT,ClientAccountID,CurrencyPrimary
DATA,ACCT,TEST-A,USD
DATA,ACCT,TEST-B,USD
BOS,TRNT,Trades
HEADER,TRNT,ClientAccountID,AssetClass,Symbol,TradeDate,Quantity,TradePrice,Proceeds,LevelOfDetail,Model
DATA,TRNT,TEST-A,STK,AAA,20260914,1,10,-10,ORDER,
DATA,TRNT,TEST-B,STK,BBB,20260915,2,20,-40,ORDER,
EOF`;
const selected = parseIbkrReport(csv);
assert.deepEqual(selected.reportScope.accountIds, ['TEST-A', 'TEST-B']);
assert.equal(selected.tradeDetails.length, 2);
assert.equal(selected.tradeDetails[1].account, 'TEST-B');
assert.match(reportReplacementIssue(selected, { ...selected, tradeDetails: [] }), /omits 2/);
assert.equal(reportReplacementIssue(selected, selected), '');
assert.match(reportReplacementIssue(selected, { ...selected, reportScope: { ...selected.reportScope, accountIds: ['TEST-A'] } }), /missing account/);
assert.match(reportReplacementIssue(selected, { ...selected, reportScope: { ...selected.reportScope, start: '2026-10-01' }, tradeDetails: [] }), /starts later/);
assert.match(reportReplacementIssue(selected, { ...selected, reportScope: { ...selected.reportScope, end: '2026-09-30' } }), /earlier/);
const swapped = { ...selected, tradeDetails: selected.tradeDetails.map(row => ({ ...row, account: 'TEST-A' })) };
assert.match(reportReplacementIssue(selected, swapped), /omits 1/);
console.log('All-account inclusion, per-account trade identity, missing-account rejection and rolling-window tests passed.');
const humanOption = { ...selected, tradeDetails: [{ account: 'TEST-B', date: '2026-09-15', symbol: 'TSLL 20NOV26 12 C', currency: 'USD', side: 'Sell' }] };
const occOption = { ...humanOption, tradeDetails: [{ ...humanOption.tradeDetails[0], symbol: 'TSLL  261120C00012000' }] };
assert.equal(reportReplacementIssue(humanOption, occOption), '');
assert.match(reportReplacementIssue(humanOption, { ...occOption, tradeDetails: [{ ...occOption.tradeDetails[0], symbol: 'TSLL 261120C00013000' }] }), /omits 1/);

const navOnlyAccount = csv.replace('EOF', 'HEADER,CNAV,ClientAccountID,FromDate,ToDate,TWR,EndingValue\nDATA,CNAV,TEST-C,20261006,20261006,0,1\nEOF');
assert.deepEqual(parseIbkrReport(navOnlyAccount).reportScope.accountIds, ['TEST-A','TEST-B','TEST-C']);
console.log('Accounts present only in NAV (no trades/account detail) are retained.');
