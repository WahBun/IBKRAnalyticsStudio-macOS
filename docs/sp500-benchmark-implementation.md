# Return Curve Benchmark Overlay

> Updated: 2026-09-05

The Return Curve card can compare the portfolio TWR curve against one benchmark at a time:

- No Benchmark
- S&P 500
- NASDAQ

The portfolio curve still uses the existing positive/negative coloring. Benchmark curves use a single purple line so the visual meaning stays consistent: purple means market benchmark.

## Frontend Behavior

- The Benchmark selector is shown in the Return Curve card header.
- The selected value is stored in `localStorage` as `ibkr-return-benchmark`.
- `No Benchmark` disables benchmark requests and renders only the portfolio curve.
- `S&P 500` and `NASDAQ` request the same portfolio date range from the Cloudflare Worker.
- In the packaged macOS app, a Tauri fallback fetches FRED `SP500` / `NASDAQCOM` CSV data directly when the Worker is unavailable, blocked by CORS, or returns an old/mismatched response.
- Hovering the chart snaps to the nearest portfolio date and shows:
  - date
  - Portfolio TWR
  - selected benchmark return when available
- The vertical crosshair and markers are hover-only and do not affect the chart layout.
- Benchmark fetch failures are silent; the portfolio curve remains usable.

## Desktop Fallback

The Tauri command `benchmark_fetch` accepts `symbol`, `start`, and `end`, fetches the matching FRED CSV series, filters it to the report range, and includes the latest close before the report start when available. This keeps weekend and holiday alignment consistent with the Worker behavior.

Supported direct FRED series:

| Symbol | FRED Series |
| --- | --- |
| `sp500` | `SP500` |
| `nasdaq` | `NASDAQCOM` |

## Normalization

Benchmark point values are never plotted as raw index prices. They are normalized to cumulative return over the current report range:

```txt
benchmark return = (close / base close - 1) * 100
```

For each portfolio date, the app uses the latest benchmark close that is not later than that date. This avoids look-ahead when the portfolio date falls on a weekend or market holiday.

The Y-axis range is calculated from both portfolio returns and the active benchmark returns so the purple line does not overflow the chart.

## Worker API

Worker path:

```txt
cloudflare/sp500-proxy/index.js
```

Public request:

```txt
GET /?symbol=sp500&start=YYYY-MM-DD&end=YYYY-MM-DD
GET /?symbol=nasdaq&start=YYYY-MM-DD&end=YYYY-MM-DD
```

For backward compatibility, omitting `symbol` defaults to `sp500`.

Response:

```json
{
  "symbol": "sp500",
  "dates": ["2026-01-02"],
  "closes": [6200.0]
}
```

Supported series:

| Symbol | FRED Series | KV Key | UI Label |
| --- | --- | --- | --- |
| `sp500` | `SP500` | `benchmark:sp500` | S&P 500 |
| `nasdaq` | `NASDAQCOM` | `benchmark:nasdaq` | NASDAQ |

The old S&P 500 KV key `sp500` is still read as a fallback, so existing deployments can continue working while the new key is populated.

## Sync

Manual sync:

```txt
GET /admin/sync?key=<SYNC_SECRET>&symbol=all
GET /admin/sync?key=<SYNC_SECRET>&symbol=sp500
GET /admin/sync?key=<SYNC_SECRET>&symbol=nasdaq
```

Cron sync runs `symbol=all`. A failure in one benchmark does not stop the other benchmark from syncing.

Required Cloudflare bindings:

- KV namespace binding: `SP500_KV`
- Secret: `FRED_API_KEY`
- Secret: `SYNC_SECRET`

## Validation Checklist

- S&P 500 and NASDAQ both return `{ symbol, dates, closes }`.
- Return Curve selector switches immediately between No Benchmark, S&P 500, and NASDAQ.
- Purple benchmark line starts from the same normalized 0% range as the portfolio curve.
- Hover tooltip shows the same date for Portfolio and Benchmark.
- No Benchmark hides the benchmark legend and marker.
- Worker/network failure does not block the report.
