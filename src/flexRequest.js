import { easternDay, marketClosures } from './refreshSchedule.js';

// Fetch one bounded annual window; flexHistory retains older records locally.
export function flexRequestRange(previous, now = new Date()) {
  const endDate = new Date(easternDay(now).date + 'T12:00:00Z');
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const end = endDate.toISOString().slice(0, 10);
  const first = new Date(endDate); first.setUTCDate(first.getUTCDate() - 364);
  const start = first.toISOString().slice(0,10);
  const required = new Date(endDate);
  while (required.getUTCDay() === 0 || required.getUTCDay() === 6 ||
         marketClosures[required.getUTCFullYear()]?.includes(required.toISOString().slice(5,10))) {
    required.setUTCDate(required.getUTCDate() - 1);
  }
  return { start, end, requiredThrough: required.toISOString().slice(0,10) };
}

export function flexResponseIssue(text, incoming, range) {
  if (/^\s*"?MSG"?,.*excluded/im.test(text)) return 'excluded';
  if (!incoming.reportScope?.end || incoming.reportScope.end < range.requiredThrough) return 'stale';
  return '';
}
