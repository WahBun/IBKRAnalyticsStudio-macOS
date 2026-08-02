# Changelog

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
