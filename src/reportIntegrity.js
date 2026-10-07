// Conservative replacement checks: never invent missing executions or carry stale positions forward.
function contractKey(symbol = "") {
  const value = symbol.trim().toUpperCase();
  const occ = value.match(/^(.+?)\s*(\d{6})([CP])(\d{8})$/);
  if (occ) return `${occ[1].trim()}|${occ[2]}|${occ[3]}|${Number(occ[4]) / 1000}`;
  const readable = value.match(/^(.+?)\s+(\d{2})([A-Z]{3})(\d{2})\s+(\d+(?:\.\d+)?)\s+([CP])$/);
  if (readable) {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const month = months.indexOf(readable[3]) + 1;
    if (month) return `${readable[1]}|${readable[4]}${String(month).padStart(2, '0')}${readable[2]}|${readable[6]}|${Number(readable[5])}`;
  }
  return value;
}

export function reportReplacementIssue(previous, incoming) {
  if (!previous) return "";
  const oldAccounts = previous.reportScope?.accountIds || [];
  const newAccounts = new Set(incoming.reportScope?.accountIds || []);
  const missingAccounts = oldAccounts.filter(account => !newAccounts.has(account));
  if (missingAccounts.length) {
    return `Report is missing account(s) ${missingAccounts.map(account => '***' + account.slice(-4)).join(', ')}. Existing history was retained.`;
  }
  const period = incoming.accountInfo?.period || "";
  const dates = period.match(/\d{4}-\d{2}-\d{2}/g);
  const start = incoming.reportScope?.start || dates?.[0];
  const end = incoming.reportScope?.end || dates?.[1];
  if (!start || !end) return "Cannot verify the new report date range. Existing history was retained.";
  if (previous.reportScope?.start && start > previous.reportScope.start) {
    return "New report starts later than the current history. Existing history was retained.";
  }
  if (previous.reportScope?.end && end < previous.reportScope.end) {
    return "New report ends earlier than the current report. Existing history was retained.";
  }
  const counts = rows => {
    const result = new Map();
    for (const row of rows || []) {
      if (row.date < start || row.date > end) continue;
      const key = JSON.stringify([row.account || "", row.date, contractKey(row.symbol), row.currency, row.side]);
      result.set(key, (result.get(key) || 0) + 1);
    }
    return result;
  };
  const before = counts(previous.tradeDetails);
  const after = counts(incoming.tradeDetails);
  const missing = [...before].reduce((sum, [date, count]) => sum + Math.max(0, count - (after.get(date) || 0)), 0);
  return missing ? `New report omits ${missing} previously reported trades within its date range. Existing history was retained; verify the report before replacing it.` : "";
}
