# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0]

### Added
- **Ad events as beacons.** `adbreakstart`, `adplay`, `adplaying`, `adpause`, `adended`, `aderror`, `adbreakend`, and `adskipped` are now sent as rows. Every ad row carries the full `view_ad_*` context and the cumulative ad counters, the same way request rows carry every `request_*` key. `adplaying` is the SDK-observed first frame and is counted once per ad; a second `adplaying` for the same ad after an `adpause` is the resume. `aderror` is an occurrence, not a terminal: failures are still settled when the break closes, so an ad that errored and then played counts as no failure.
- **`adpause`**, derived from the media element's `pause` while an ad that has rendered is still in progress.
- **Quartile events** `adfirstquartile`, `admidpoint`, `adthirdquartile`, once per ad attempt. On hls.js and dash.js they are inferred from the ad's own playhead and fire only when playback progresses through the threshold: a seek past a threshold fires nothing, a pause or stall never re-fires one. Wrappers forward their ad SDK's native quartile callbacks under the same names; a wrapper report and an engine crossing of the same threshold produce one row. No new wire keys or counters.
- **Asset-list failures** (`ASSET_LIST_LOAD_ERROR`, `ASSET_LIST_LOAD_TIMEOUT`, `ASSET_LIST_PARSING_ERROR`, `INTERSTITIAL_ASSET_ITEM_ERROR`) now raise `aderror`; previously a break whose list never loaded reported no error.
- **`aderror` flushes immediately**, like `error`, so an ad failure right before the viewer leaves is not lost in the batch.
- **Ad URL and error-text redaction.** `view_ad_asset_url`, `view_ad_tag_url`, and `view_ad_click_url` keep scheme, host, and path only, with token-like path segments masked; `view_ad_error_message` has embedded URLs redacted and is capped at 256 characters.

### Changed
- **Break watchdog is progress based.** A break times out after 30 s with no ad activity or playhead movement, with a hard ceiling of four times the scheduled duration, instead of a fixed multiple of the scheduled duration. A long pause inside an ad no longer trips it. When it fires, `adbreakend` is emitted so the row exists.
- **`player_playhead_time` stays at the content position during an HLS interstitial**, read from `interstitialsManager.primary`; previously it reported the ad's own position.
- **`view_is_ad_playing` is false on the `adbreakend` row** and is documented as "ad mode active", not evidence that a frame rendered.
- **Per-asset ad fields are cleared** when a break opens and closes, so a later break's `adbreakstart` no longer carries the previous ad's identity.
- **`view_preroll_load_time`** is measured from the later of break open and first `play`, so click-to-play idle time is no longer counted as ad load time.
- `player_fastpix_sdk_version` now reports the package version (it had been fixed at 1.0.5).

### Fixed
- `configure()` threw `ReferenceError: document is not defined` outside a browser (React Native, Node) because of a bare `document !== undefined` check. Restored the `typeof` guards from 1.0.7 and applied the same to the two `window` reads.

## [1.1.0]

### Added
- **Rendition tracking** - `view_rendition_upshift_count`, `view_rendition_downshift_count`, `view_last_rendition_changed_time`,`video_source_rendition_name` and initial-bitrate capture on both HLS and DASH.
- **Viewer environment fields** - browser viewport dimensions, cookies-enabled, and Do Not Track.
- **Player state fields** - mute, volume, loop, playback rate, viewable percentage, and picture-in-picture usage.
- **New pass-through metadata** - `application_name`, `application_version`, `page_type`, the three `viewer_plan*` fields, eight `video_*` title fields, DRM level, CDN edge/origin, time-shift and captions/PiP capability flags.
- **Ad tracking for HLS Interstitials** (`EXT-X-DATERANGE CLASS="com.apple.hls.interstitial"`) - break identity and position, per-asset identity and index, attempt/impression/error counters, preroll request and load timing, and ad rebuffering.
- **Ad tracking for DASH multi-Period SSAI** - ad breaks are detected from the `AssetIdentifier` descriptor, accepting both the MPEG (`urn:mpeg:dash:asset-id:2013`) and DASH-IF (`urn:org:dashif:asset-id:2013`) scheme identifiers, since encoders emit both. The content asset is identified as the asset id owning the greatest total duration across periods, so a leading preroll period is never mistaken for content.

## [1.0.9]
### Fixed
- SSR crash: importing the SDK in Node/server environments (e.g. Next.js server rendering) threw `ReferenceError: window is not defined` due to an unsafe `window !== undefined` guard; now uses `typeof window !== "undefined"`.

### Added
- Bundled TypeScript declarations (`dist/index.d.ts`): typed `fastpixMetrix` API, exported `EventMetaData` tracker-config type, and global typing for the `fp` monitoring handle attached to media elements.
- `player_fastpix_sdk_name` and `player_fastpix_sdk_version` declared in the metadata types.

### Changed
- `player_init_time` now accepts `number | string`, matching attribute-driven players that read it via `getAttribute`. No runtime change - the SDK's arithmetic already coerced numeric strings.
- Build migrated from esbuild CLI scripts to tsup (identical output filenames); `tsc --noEmit` type-check now runs as part of the build.
- Removed unused `@types/node` dev dependency.

## [1.0.8]
### Changed
- Switched to native `crypto` APIs for random number and UUID generation, removing the external `uuid` dependency and reducing bundle size.
- Updated the default metrics collection endpoint domain.
- Added local test pages for HLS and DASH player integration.
- General code sanitization and hygiene improvements across the SDK internals to enhance reliability and long-term maintainability.

## [1.0.7]
### Changed
- Updated the SDK’s default metrics collection domain to improve endpoint reliability and alignment with current infrastructure.
- Explicitly configured custom domains continue to be respected.

## [1.0.6]
### Changed
- Updated npm authentication from Classic token to Granular token for improved security and fine-grained permissions.

## [1.0.5]
- Added support for accepting user-provided player_software_name and player_software_version via user-passable data.

## [1.0.4]
- Added `request_url` to capture each video chunk URL in hls and dash players.
- Implemented strict checks for `document` and `window` objects to ensure execution only in browser environments.
- Fixed bug where `destroyHlsMonitoring` could throw a runtime error.
- Updated UUID generation method to work seamlessly across both web and mobile applications.

## [1.0.3]
- Updated `package.json` to include additional keywords related to video analytics, HLS, and DASH players.

## [1.0.2]
- Added support for DASH.js video player monitoring
- Enhanced analytics collection for DASH streams
- Improved error tracking for DASH.js players

## [1.0.1]
- Resolved proper cleanup of HLS streams upon the viewComplete event.
- Enhanced stream handling logic: when a new player instance is initialized while another is in progress, the SDK now correctly destroys the previous player's data monitoring and seamlessly switches to capture analytics for the incoming player.

## [1.0.0]

### Added
- Initial release of FastPix Video Data Core SDK
- Support for HLS.js video player monitoring
- Real-time analytics collection and reporting
- Custom event tracking capabilities
- Error tracking and diagnostics
- Performance metrics collection
- Stream-level analytics
- User interaction tracking
