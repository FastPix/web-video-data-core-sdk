# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0]

### Added
- **Integration with HLS**:
  - Enabled video performance tracking using FastPix Data SDK, supporting HLS streams with user engagement metrics, playback quality monitoring, and real-time streaming diagnostics.
  - Provides robust error management and reporting capabilities for seamless HLS video performance tracking.
  - Allows customizable behavior, including options to disable cookies, respect `Do Not Track` settings, and configure advanced error tracking and automatic error handling.
  - Includes support for custom metadata, enabling users to pass optional fields such as `video_id`, `video_title`, `video_duration`, and more.
  - Introduced event tracking for `videoChange` and `programChange` to handle seamless metadata updates during playback transitions.
