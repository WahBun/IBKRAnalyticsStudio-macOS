# Changelog

## v2.2.11

Status indicator cursor polish.

- Removed the help/question-mark cursor from the top warning status indicator.

## v2.2.10

Daily review and privacy polish.

- Added click-to-filter behavior on the Daily P/L calendar so the trade history table can focus on one selected day, with a quick return to the full monthly list.
- Added the position amount privacy toggle to the Overview allocation share card.
- Replaced the top refresh status help marker with a warning-style indicator.

## v2.1.25-macos.1

Local return summary alignment update.

- Centered the four Return Curve summary cards while leaving the rest of the dashboard layout unchanged.

## v2.1.24-macos.1

Local KPI alignment update.

- Centered compact KPI cards while leaving tables, charts, and allocation rows unchanged.

## v2.1.23-macos.1

Local Dock icon fill update.

- Kept the in-app circular brand avatar and switched the bundled macOS Dock icon to a full-bleed photo crop.

## v2.1.22-macos.1

Local icon refinement.

- Changed the app artwork to a Discord-style circular photo icon and matched the in-app brand mark shape.

## v2.1.21-macos.1

Local brand and monthly fee detail update.

- Stopped counting Flex `UNBC` commission totals as separate other fees in the monthly chart.
- Updated masked account display to keep the first character and last four digits, such as `U***0629`.
- Renamed the in-app brand to `IBKR Analytics Studio` and refreshed app icons from the supplied photo.

## v2.1.20-macos.1

Local monthly tooltip fix.

- Replaced the monthly chart hover detail with an inline CSS tooltip so each month reliably shows its values.
- Capitalized the English expense legend to `Fees + Commissions`.

## v2.1.19-macos.1

Local monthly chart polish.

- Made the monthly income/expense legend explicit: net P/L versus fees plus commissions.
- Added multi-line hover details per month with net P/L, commissions, other fees, total expenses, and pre-expense contribution.
- Improved monthly bar colors so net P/L and expenses are visually distinct.

## v2.1.18-macos.1

Local NAV parsing fix.

- Aggregated same-day Flex NAV and daily return rows across multiple IBKR account segments instead of taking only the first account row.
- Ignored `$1` placeholder NAV/Cash rows when material positions exist, preventing Overview from showing fake `$1.00` values.
- Kept NAV history and return curve aligned with the combined account totals.

## v2.1.17-macos.1

Overview and NAV parsing polish release.

- Improved Flex NAV parsing so the latest usable NAV row is preferred when the newest row has blank totals.
- Recovered current NAV and cash from NAV history when IBKR omits those values while open positions still exist.
- Cleaned up Overview KPI display and holdings allocation alignment.

## v2.1.16-macos.1

macOS packaging fix release.

- Rebuilt the DMG with an explicit ad-hoc signed `.app` bundle to avoid the broken-signature "damaged" install failure on other Macs.
- Added build-time signature verification and DMG verification before a package is published.

## v2.1.15-macos.1

Icon and allocation legend polish release.

- Replaced the app icon with the selected E2 cyan chart mark and refreshed macOS icon assets.
- Updated the in-app brand mark to use the same rounded icon without black cropping.
- Adjusted pie chart legends so symbols stay on top and percentage / amount values sit underneath.
- Centered the Positions cost column, removed the misleading contributor count pill, and moved the holdings total above the legend.

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
