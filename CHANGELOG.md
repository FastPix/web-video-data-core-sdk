# Changelog

All notable changes to this project will be documented in this file.

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
