# Changelog

## v2.1.15-macos.1

Icon and allocation legend polish release.

- Replaced the app icon with the selected E2 cyan chart mark and refreshed macOS icon assets.
- Updated the in-app brand mark to use the same rounded icon without black cropping.
- Adjusted pie chart legends so symbols stay on top and percentage / amount values sit underneath.

## v2.1.14-macos.1

Pie chart hotfix release.

- Restored the original conic pie chart visuals and kept hover tooltips as a transparent overlay.
- Fixed the pie chart shrinkage caused by visible SVG rings inheriting global icon sizing.
- Removed the left accent stripe from the featured Total P/L card.

## v2.1.13-macos.1

Overview polish release.

- Shortened the dashboard refresh status pill so it does not crowd tab titles and search.
- Unified allocation bars and pie charts with the blue/cyan holdings palette.
- Replaced static conic pies with interactive SVG rings that expose segment amounts on hover.
- Hid the return curve when daily NAV/TWR data is incomplete instead of showing misleading returns.

## v2.1.12-macos.1

Positions UI polish release.

- Restyled the Flex refresh action into a lighter blue/cyan toolbar button.
- Simplified the Positions page by removing currency-only UI, row-count pills, and allocation percentages from the top cards.
- Added average cost to open positions and normalized futures / futures-options asset labels.
- Centered the Performance P/L cards after removing return rows and duplicate helper text.

## v2.1.11-macos.1

Refresh performance release.

- Poll IBKR Flex reports sooner while a statement is still generating, reducing avoidable wait time on successful refreshes.
- Skip full parsing and dashboard rerendering when a background refresh returns the same report content already shown.
- Debounce dashboard search rendering so typing no longer forces a full rerender for every keystroke.

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
