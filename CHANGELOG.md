# Changelog

## v2.1.10-macos.1

UI bugfix release.

- Fixed overflow in Positions distribution cards when labels, bars, and values compete for narrow card width.
- Fixed Performance KPI return values overflowing their cards by using compact return percentages with full values available on hover.
- Improved P/L distribution layout so totals and category cards stay inside their boundaries at medium desktop widths.

## v2.1.9-macos.1

Bugfix release.

- Fixed the top-bar search on the Daily view.
- Search now filters Daily trade history and recomputes the P/L calendar, daily trade chart, and summary cards from matching trades.
- Added a compact clear-search button in the dashboard search field.

## v2.1.8-macos.1

First macOS-focused release.

- Added a Tauri desktop shell for macOS.
- Added native Rust support for IBKR Flex Web Service fetching.
- Added automatic local proxy routing for common Veee/Clash-style setups.
- Added token/query normalization so pasted labels and spaces are stripped before saving.
- Default successful Flex report loads to the Daily view.
- Added a rounded macOS app icon.
- Added reproducible `.dmg` packaging through `npm run tauri:dmg`.

This project remains MIT licensed and is based on `G061206/IBKRAnalyticsStudio`.
