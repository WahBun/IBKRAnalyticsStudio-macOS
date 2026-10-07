# Flex report refresh repair (2.2.23)

The native SendRequest now includes explicit fd/td dates. The end is yesterday in New York; the start covers at least a year and does not advance past existing history. AnalyticsStudio replaces complete reports, so it must not use Wheel's short incremental window without a separate full-report merge implementation.

Before accepting or caching a response, reject excluded accounts, stale report dates, missing accounts, later starting dates, earlier ending dates and missing previously reported trades. NAV-only accounts are included in report scope, and scope metadata survives section filtering. A rejected response does not mark the day's refresh successful, preserving the scheduled fallback. Previous cached report content remains recoverable.

Validation: JS scheduling, integrity, explicit-range and rendering regression tests; Rust URL construction test; opt-in native live Flex fetch. The October 7 read-only request returned the October 7, 2025–October 6, 2026 range, four accounts and 540 trades, matching the manually exported reference under account/contract/date/side identity checks. No credentials or private report contents are included here.

IB report publication timing remains external. Missing or stale reports are retained as errors rather than presented as fresh. Windows bridge date support is included but requires Windows runtime verification. The official PortfolioAnalyst consolidated-return import is outside this change.
