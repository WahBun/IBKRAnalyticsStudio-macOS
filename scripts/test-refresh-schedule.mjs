import assert from 'node:assert/strict';
import { automaticRefreshDay, easternDay, marketClosures } from '../src/refreshSchedule.js';

const due = (time, history) => automaticRefreshDay(new Date(time), history);
assert.equal(due('2026-09-09T08:04:59Z'), null);
assert.equal(due('2026-09-09T08:05:00Z'), '2026-09-09');
assert.equal(due('2026-09-09T10:59:59Z', { earlyAttempted: '2026-09-09' }), null);
assert.equal(due('2026-09-09T11:00:00Z'), '2026-09-09');
assert.equal(due('2026-12-09T09:04:59Z'), null);
assert.equal(due('2026-12-09T09:05:00Z'), '2026-12-09');
assert.equal(due('2026-12-09T11:59:59Z', { earlyAttempted: '2026-12-09' }), null);
assert.equal(due('2026-09-09T11:00:00Z', { earlyAttempted: '2026-09-09' }), '2026-09-09');
assert.equal(due('2026-09-09T11:00:00Z', { earlyAttempted: '2026-09-09', succeeded: '2026-09-09' }), null);
assert.equal(due('2026-12-09T12:00:00Z'), '2026-12-09');
assert.equal(due('2026-09-07T15:00:00Z'), null);
assert.equal(due('2026-09-08T11:00:00Z'), '2026-09-08');
assert.equal(due('2026-09-05T15:00:00Z'), null);
assert.equal(due('2026-09-06T15:00:00Z'), null);
assert.equal(due('2026-09-14T11:00:00Z'), '2026-09-14');
assert.equal(due('2026-09-09T18:00:00Z', { attempted: '2026-09-09' }), null);
assert.equal(due('2026-09-09T18:00:00Z', { succeeded: '2026-09-09' }), null);
assert.equal(due('2026-09-10T11:00:00Z', { attempted: '2026-09-09' }), '2026-09-10');
assert.equal(due('2026-11-27T12:00:00Z'), '2026-11-27');
assert.equal(due('2026-12-24T12:00:00Z'), '2026-12-24');
assert.equal(due('2027-12-31T12:00:00Z'), '2027-12-31');
assert.equal(due('2029-01-02T12:00:00Z'), null);
assert.equal(easternDay(new Date('2026-09-10T00:00:00+08:00')).date, '2026-09-09');
assert.equal(easternDay(new Date('2026-03-08T11:00:00Z')).hour, 7);
assert.equal(easternDay(new Date('2026-11-01T12:00:00Z')).hour, 7);
for (const [year, dates] of Object.entries(marketClosures)) {
  for (const date of dates) assert.equal(due(`${year}-${date}T15:00:00Z`), null);
}
console.log('Refresh schedule passed: DST, holidays, weekends, catch-up, deduplication, early closes, calendar expiry.');

const interrupted = { attempted: '2026-09-09', networkFailed: '2026-09-09' };
assert.equal(automaticRefreshDay(new Date('2026-09-09T15:00:00Z'), interrupted), null);
assert.equal(automaticRefreshDay(new Date('2026-09-09T15:00:00Z'), interrupted, { recoverNetwork: true }), '2026-09-09');
assert.equal(automaticRefreshDay(new Date('2026-09-09T15:00:00Z'), { ...interrupted, recoveryAttempted: '2026-09-09' }, { recoverNetwork: true }), null);
assert.equal(automaticRefreshDay(new Date('2026-09-09T15:00:00Z'), { ...interrupted, succeeded: '2026-09-09' }, { recoverNetwork: true }), null);
assert.equal(automaticRefreshDay(new Date('2026-09-09T15:00:00Z'), { attempted: '2026-09-09' }, { recoverNetwork: true }), null);
assert.equal(automaticRefreshDay(new Date('2026-09-07T15:00:00Z'), { attempted: '2026-09-07', networkFailed: '2026-09-07' }, { recoverNetwork: true }), null);
console.log('Wake recovery passed: network-only, once per day, successful refresh and holiday protection.');
