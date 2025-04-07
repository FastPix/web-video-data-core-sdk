# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1]
- Resolved proper cleanup of HLS streams upon the viewComplete event.
- Enhanced stream handling logic: when a new player instance is initialized while another is in progress, the SDK now correctly destroys the previous player’s data monitoring and seamlessly switches to capture analytics for the incoming player.

## [1.0.0]

### Added
- **Integration with HLS**:
  - Enabled video performance tracking using FastPix Data SDK, supporting HLS streams with user engagement metrics, playback quality monitoring, and real-time streaming diagnostics.
  - Provides robust error management and reporting capabilities for HLS video performance tracking.
  - Allows customizable behavior, including options to disable cookies, respect `Do Not Track` settings, and configure advanced error tracking and automatic error handling.
  - Includes support for custom metadata, enabling users to pass optional fields such as `video_id`, `video_title`, `video_duration`, and more.
  - Introduced event tracking for `videoChange` to handle metadata updates during playback transitions.
