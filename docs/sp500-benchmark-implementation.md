# Return Curve Benchmark Overlay

> Updated: 2026-09-05

The Return Curve card can compare the portfolio TWR curve against the S&P 500 benchmark.

## Frontend Behavior

- The Benchmark selector is shown in the Return Curve card header.
- The selected value is stored in `localStorage` as `ibkr-return-benchmark`.
- `No Benchmark` disables benchmark requests and renders only the portfolio curve.
- `S&P 500` requests the same portfolio date range from the Cloudflare Worker.
- In the packaged macOS app, a Tauri fallback fetches FRED `SP500` CSV data directly when the Worker is unavailable, blocked by CORS, or returns an old/mismatched response.
- The app also ships with a recent S&P 500 cache under `assets/benchmarks/sp500.json` as a final fallback, so the benchmark line does not disappear when both remote paths fail.
- Hovering the chart snaps to the nearest portfolio date and shows the date, Portfolio TWR, and S&P 500 return when available.
- The vertical crosshair and markers are hover-only and do not affect the chart layout.
- Benchmark fetch failures are silent; the portfolio curve remains usable.

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

## Sync

Manual sync:

```txt
GET /admin/sync?key=<SYNC_SECRET>&symbol=sp500
```

Required Cloudflare bindings:

- KV namespace binding: `SP500_KV`
- Secret: `FRED_API_KEY`
- Secret: `SYNC_SECRET`

## Validation Checklist

- S&P 500 returns `{ symbol, dates, closes }`.
- Return Curve selector switches between No Benchmark and S&P 500.
- The purple benchmark line starts from the same normalized 0% range as the portfolio curve.
- Hover tooltip shows the same date for Portfolio and S&P 500.
- No Benchmark hides the benchmark legend and marker.
- Worker/network failure does not block the report.
