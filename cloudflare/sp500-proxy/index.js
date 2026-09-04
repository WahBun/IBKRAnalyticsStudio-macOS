const FRED_API_URL = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_TTL = 86400;
const BACKFILL_CHUNK_YEARS = 5;
const FRED_RETRY_DELAYS_MS = [800, 1600, 3200];
const DEFAULT_SYMBOL = "sp500";
const BENCHMARKS = {
  sp500: {
    symbol: "sp500",
    label: "S&P 500",
    fredSeriesId: "SP500",
    kvKey: "benchmark:sp500",
    legacyKvKey: "sp500",
    backfillStartDate: "1957-03-04"
  },
  nasdaq: {
    symbol: "nasdaq",
    label: "NASDAQ",
    fredSeriesId: "NASDAQCOM",
    kvKey: "benchmark:nasdaq",
    backfillStartDate: "1971-02-05"
  }
};

const ALLOWED_ORIGINS = new Set([
  "https://ibkr-analytics.app",
  "https://ibkr-analytics.local",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
  "http://127.0.0.1:4187",
  "http://localhost:4187"
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
  }
  return {};
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json"
    }
  });
}

function errorResponse(message, status, headers = {}) {
  return jsonResponse({ error: message }, status, headers);
}

function isAuthorizedSyncRequest(request, env) {
  const secret = env.SYNC_SECRET || "";
  if (!secret) return false;

  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key") || "";
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return queryKey === secret || bearer === secret;
}

function addYears(dateString, years) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function previousDay(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSymbol(value) {
  const key = String(value || DEFAULT_SYMBOL).trim().toLowerCase();
  if (key === "spx" || key === "sp500" || key === "s&p500" || key === "s&p 500") return "sp500";
  if (key === "nasdaq" || key === "nasdaqcom" || key === "ixic") return "nasdaq";
  return BENCHMARKS[key] ? key : "";
}

function requestedSyncSymbols(value) {
  const key = String(value || "all").trim().toLowerCase();
  if (!key || key === "all") return Object.keys(BENCHMARKS);
  const symbol = normalizeSymbol(key);
  return symbol ? [symbol] : [];
}

async function readBenchmarkData(env, config) {
  const current = await env.SP500_KV.get(config.kvKey, "json");
  if (current && current.dates && current.dates.length) return current;
  if (!config.legacyKvKey) return current;
  return await env.SP500_KV.get(config.legacyKvKey, "json");
}

async function fetchFromFredWithRetry(start, end, apiKey, config) {
  let lastError = null;
  for (let attempt = 0; attempt <= FRED_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fetchFromFred(start, end, apiKey, config);
    } catch (error) {
      lastError = error;
      if (attempt === FRED_RETRY_DELAYS_MS.length) break;
      await delay(FRED_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError || new Error("FRED request failed");
}

async function backfillFromFred(start, end, apiKey, config) {
  let cursor = start;
  let merged = { dates: [], closes: [] };
  let chunkCount = 0;

  while (cursor <= end) {
    const nextStart = addYears(cursor, BACKFILL_CHUNK_YEARS);
    const chunkEnd = previousDay(nextStart) < end ? previousDay(nextStart) : end;
    const chunk = await fetchFromFredWithRetry(cursor, chunkEnd, apiKey, config);
    merged = mergeData(merged, chunk);
    chunkCount += 1;
    cursor = addYears(cursor, BACKFILL_CHUNK_YEARS);
  }

  return { ...merged, chunkCount };
}

async function syncBenchmarkData(env, config, options = {}) {
  const apiKey = env.FRED_API_KEY;
  if (!apiKey) {
    throw new Error("FRED_API_KEY is not set");
  }

  if (!env.SP500_KV) {
    throw new Error("SP500_KV is not bound");
  }

  const today = new Date().toISOString().slice(0, 10);
  const existing = options.forceFull ? null : await readBenchmarkData(env, config);

  if (!existing || !existing.dates || existing.dates.length === 0) {
    console.log(`KV empty, backfilling full ${config.label} history from FRED in chunks...`);
    const full = await backfillFromFred(config.backfillStartDate, today, apiKey, config);
    const data = { dates: full.dates, closes: full.closes };
    await env.SP500_KV.put(config.kvKey, JSON.stringify(data));
    return {
      symbol: config.symbol,
      mode: "backfill",
      chunks: full.chunkCount,
      added: data.dates.length,
      total: data.dates.length,
      firstDate: data.dates[0] || "",
      lastDate: data.dates.at(-1) || ""
    };
  }

  const lastDate = existing.dates[existing.dates.length - 1];

  if (lastDate >= today) {
    return {
      symbol: config.symbol,
      mode: "noop",
      added: 0,
      total: existing.dates.length,
      firstDate: existing.dates[0] || "",
      lastDate
    };
  }

  console.log(`Syncing ${config.label} from ${lastDate} to ${today}`);
  const recent = await fetchFromFredWithRetry(lastDate, today, apiKey, config);
  if (recent.dates.length === 0) {
    return {
      symbol: config.symbol,
      mode: "noop",
      added: 0,
      total: existing.dates.length,
      firstDate: existing.dates[0] || "",
      lastDate
    };
  }

  const merged = mergeData(existing, recent);
  await env.SP500_KV.put(config.kvKey, JSON.stringify(merged));
  return {
    symbol: config.symbol,
    mode: "incremental",
    added: Math.max(0, merged.dates.length - existing.dates.length),
    total: merged.dates.length,
    firstDate: merged.dates[0] || "",
    lastDate: merged.dates.at(-1) || ""
  };
}

async function syncRequestedBenchmarks(env, symbolParam, options = {}) {
  const symbols = requestedSyncSymbols(symbolParam);
  if (!symbols.length) {
    throw new Error("Unsupported symbol. Use sp500, nasdaq, or all.");
  }

  const results = [];
  for (const symbol of symbols) {
    const config = BENCHMARKS[symbol];
    try {
      results.push(await syncBenchmarkData(env, config, options));
    } catch (error) {
      results.push({
        symbol,
        ok: false,
        error: error.message || "Benchmark sync failed"
      });
    }
  }

  const failed = results.filter((result) => result.ok === false);
  if (failed.length === results.length) {
    throw new Error(failed.map((result) => `${result.symbol}: ${result.error}`).join("; "));
  }

  return results.map((result) => result.ok === false ? result : { ok: true, ...result });
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function sliceRange(data, start, end) {
  const dates = [];
  const closes = [];
  const startTs = Date.parse(start);
  const endTs = Date.parse(end);
  let carryIndex = -1;

  for (let i = 0; i < data.dates.length; i++) {
    const ts = Date.parse(data.dates[i]);
    if (ts < startTs) {
      carryIndex = i;
      continue;
    }
    if (ts >= startTs && ts <= endTs) {
      dates.push(data.dates[i]);
      closes.push(data.closes[i]);
    }
  }

  if (carryIndex >= 0) {
    dates.unshift(data.dates[carryIndex]);
    closes.unshift(data.closes[carryIndex]);
  }

  return { dates, closes };
}

async function fetchFromFred(start, end, apiKey, config) {
  const url = `${FRED_API_URL}?series_id=${config.fredSeriesId}&api_key=${apiKey}&file_type=json&observation_start=${start}&observation_end=${end}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const raw = await res.json();
  const observations = raw.observations || [];

  const dates = [];
  const closes = [];
  for (const entry of observations) {
    if (entry.date && entry.value && entry.value !== ".") {
      dates.push(entry.date);
      closes.push(Number(entry.value));
    }
  }

  return { dates, closes };
}

function mergeData(existing, incoming) {
  if (!existing || !existing.dates) return incoming;

  const map = new Map();
  for (let i = 0; i < existing.dates.length; i++) {
    map.set(existing.dates[i], existing.closes[i]);
  }
  for (let i = 0; i < incoming.dates.length; i++) {
    map.set(incoming.dates[i], incoming.closes[i]);
  }

  const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    dates: sorted.map(([d]) => d),
    closes: sorted.map(([, v]) => v)
  };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/admin/sync") {
      if (request.method !== "GET" && request.method !== "POST") {
        return errorResponse("Method not allowed", 405, headers);
      }

      if (!env.SYNC_SECRET) {
        return errorResponse("SYNC_SECRET is not configured", 500, headers);
      }

      if (!isAuthorizedSyncRequest(request, env)) {
        return errorResponse("Unauthorized", 401, headers);
      }

      try {
        const results = await syncRequestedBenchmarks(env, url.searchParams.get("symbol") || "all", {
          forceFull: url.searchParams.get("full") === "1"
        });
        return jsonResponse({ ok: true, results }, 200, {
          ...headers,
          "Cache-Control": "no-store"
        });
      } catch (error) {
        return errorResponse(error.message || "Manual sync failed", 500, headers);
      }
    }

    const symbol = normalizeSymbol(url.searchParams.get("symbol") || DEFAULT_SYMBOL);
    if (!symbol) {
      return errorResponse("Unsupported symbol. Use sp500 or nasdaq.", 400, headers);
    }
    const config = BENCHMARKS[symbol];
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    if (!start || !end || !isValidDate(start) || !isValidDate(end)) {
      return errorResponse("start and end query params required (YYYY-MM-DD)", 400, headers);
    }

    if (Date.parse(start) > Date.parse(end)) {
      return errorResponse("start must be before end", 400, headers);
    }

    if (!env.SP500_KV) {
      return errorResponse("SP500_KV is not bound", 500, headers);
    }

    const raw = await readBenchmarkData(env, config);
    if (!raw || !raw.dates || raw.dates.length < 2) {
      return errorResponse(`${config.label} data not yet synced. Run /admin/sync with SYNC_SECRET or wait for the daily cron job.`, 503, headers);
    }

    const sliced = sliceRange(raw, start, end);

    if (sliced.dates.length < 2) {
      return errorResponse(`No ${config.label} data available for the requested date range`, 404, headers);
    }

    const body = JSON.stringify({
      symbol: config.symbol,
      dates: sliced.dates,
      closes: sliced.closes
    });

    return new Response(body, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL}`
      }
    });
  },

  async scheduled(event, env) {
    try {
      const results = await syncRequestedBenchmarks(env, "all");
      console.log(`Benchmark sync complete: ${JSON.stringify(results)}`);
    } catch (error) {
      console.error(error.message || "Scheduled benchmark sync failed");
    }
  }
};
