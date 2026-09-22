// NYSE published calendar: https://www.nyse.com/trade/hours-calendars
// Keep calendar data separate so new years and exceptional closures can be updated.
export const marketClosures = {
  2026: ['01-01', '01-19', '02-16', '04-03', '05-25', '06-19', '07-03', '09-07', '11-26', '12-25'],
  2027: ['01-01', '01-18', '02-15', '03-26', '05-31', '06-18', '07-05', '09-06', '11-25', '12-24'],
  2028: ['01-17', '02-21', '04-14', '05-29', '06-19', '07-04', '09-04', '11-23', '12-25']
};

const easternClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function easternDay(now = new Date()) {
  const parts = Object.fromEntries(easternClock.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function refreshWindow(now = new Date()) {
  const { hour, minute } = easternDay(now);
  if (hour >= 7) return 'regular';
  return hour * 60 + minute >= 245 ? 'early' : null;
}

export function automaticRefreshDay(now, { attempted = '', earlyAttempted = '', succeeded = '', networkFailed = '', recoveryAttempted = '' } = {}, { recoverNetwork = false } = {}) {
  const { date } = easternDay(now);
  const slot = refreshWindow(now);
  const holidays = marketClosures[Number(date.slice(0, 4))];
  // Unknown calendar years must not silently be treated as all weekdays open.
  if (!holidays || !slot || date === succeeded) return null;
  const slotAttempted = slot === 'early' ? earlyAttempted : attempted;
  if (date === slotAttempted && !(recoverNetwork && networkFailed === date && recoveryAttempted !== date)) return null;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6 || holidays.includes(date.slice(5))) return null;
  return date;
}
