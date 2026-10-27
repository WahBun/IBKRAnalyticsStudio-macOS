import { parseIbkrReport, splitCsvRows, parseCsvLine } from './parser.js';
import { reportReplacementIssue } from './reportIntegrity.js';

const encode = row => row.map(cell => '"' + String(cell ?? '').replaceAll('"', '""') + '"').join(',');
const date = value => String(value || '').match(/^(\d{4})-?(\d{2})-?(\d{2})/)?.slice(1).join('-') || '';

function read(text) {
  const rows = splitCsvRows(text).map(parseCsvLine);
  if (!rows.some(row => row[0].replace(/^\uFEFF/, '') === 'BOF')) return null;
  const sections = new Map();
  const records = [];
  for (const row of rows) {
    const [type, code] = row;
    if (type === 'BOS') sections.set(code, { name: row[2], headers: [] });
    if (type === 'HEADER') {
      const section = sections.get(code) || { name: code };
      section.headers = row.slice(2);
      sections.set(code, section);
    }
    if (type === 'DATA' && sections.has(code)) {
      const section = sections.get(code);
      records.push({ code, name: section.name, headers: section.headers,
        values: row.slice(2), data: Object.fromEntries(section.headers.map((key, i) => [key, row[i + 2] || ''])) });
    }
  }
  return { rows, records };
}

function historyDate(record) {
  const { code, name, data: row } = record;
  const fields = {
    EQUT: ['ReportDate'], CNAV: ['ToDate'], FIFO: ['ReportDate'],
    TRNT: ['DateTime', 'TradeDate', 'ReportDate'], FXTR: ['DateTime', 'ReportDate'],
    TIER: ['ValueDate', 'ReportDate'], TRTX: ['Date', 'ReportDate']
  };
  let keys = fields[code];
  if (/Cash Transactions/i.test(name)) keys = ['DateTime', 'Date', 'ReportDate', 'SettleDate'];
  if (/^Dividends$/i.test(name)) keys = ['Date', 'PayDate', 'ReportDate'];
  if (/Change in Dividend Accruals/i.test(name)) keys = ['Date', 'ReportDate'];
  if (!keys) return null; // Snapshot sections always come exclusively from the new report.
  const result = date(keys.map(key => row[key]).find(Boolean));
  if (!result) throw new Error('Cannot date a historical Flex record. Previous history retained.');
  return result;
}

export function mergeFlexHistory(previousText, incomingText) {
  if (!previousText) return incomingText;
  const previous = parseIbkrReport(previousText);
  const incoming = parseIbkrReport(incomingText);
  const start = incoming.reportScope.start;
  // Validate account identity, freshness and overlapping executions before merging.
  const issue = reportReplacementIssue({ ...previous, reportScope: { ...previous.reportScope, start } }, incoming);
  if (issue) throw new Error(issue);
  if (!previous.reportScope.start || previous.reportScope.start >= start) return incomingText;
  if (previous.reportScope.end < start) throw new Error('New report leaves a gap in saved history. Previous history retained.');
  const oldReport = read(previousText), newReport = read(incomingText);
  if (!oldReport || !newReport) throw new Error('Historical merge requires Flex CSV reports. Previous history retained.');
  const retained = oldReport.records.filter(record => {
    const d = historyDate(record);
    return d && d < start;
  });
  // A daily NAV/TWR record disappearing within the overlap is not a valid refresh.
  for (const code of ['EQUT', 'CNAV']) {
    const key = record => JSON.stringify([record.data.ClientAccountID, record.data.CurrencyPrimary, historyDate(record)]);
    const current = new Set(newReport.records.filter(r => r.code === code).map(key));
    if (oldReport.records.some(r => r.code === code && historyDate(r) >= start && !current.has(key(r)))) {
      throw new Error('New report omits saved daily account history. Previous history retained.');
    }
  }
  const output = newReport.rows.filter(row => !['EOF', 'EOA'].includes(row[0])).map(row => {
    if (row[0].replace(/^\uFEFF/, '') === 'BOF') return [...row.slice(0, 4), previous.reportScope.start.replaceAll('-', ''), ...row.slice(5)];
    return row;
  });
  // Keep original schemas so column changes cannot reinterpret archived values.
  const groups = new Map();
  for (const record of retained) {
    const key = JSON.stringify([record.code, record.name, record.headers]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const records of groups.values()) {
    const { code, name, headers } = records[0];
    output.push(['BOS', code, name], ['HEADER', code, ...headers]);
    for (const record of records) output.push(['DATA', code, ...record.values]);
    output.push(['EOS', code]);
  }
  output.push(['EOF']);
  const merged = output.map(encode).join('\n');
  const mergedIssue = reportReplacementIssue(previous, parseIbkrReport(merged));
  if (mergedIssue) throw new Error(mergedIssue);
  return merged;
}
