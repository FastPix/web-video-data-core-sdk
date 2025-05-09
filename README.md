# Introduction:

FastPix Video Data Core SDK monitors and analyzes **HLS.js** and **DASH.js** video players. Get instant insights into video performance with our monitoring features:

- Real-time stream analytics (manifest loading, segments, quality switches)
- Player performance data (startup time, buffering, quality)
- Network metrics (bandwidth, request timing)
- Error logs and diagnostics
- User interaction events

The SDK instantly collects and sends all metrics to the [FastPix dashboard](https://dashboard.fastpix.io) for easy viewing. Currently available as a JavaScript bundle, with TypeScript support coming soon.

# Prerequisites:

## Getting Started

To begin tracking your video analytics, you'll need your FastPix workspace key. Here's how to get it:

1. Sign up or login to [FastPix Dashboard](https://dashboard.fastpix.io).
2. Navigate to the workspace page.
3. Copy your preferred workspace key.

That's it! You're ready to integrate the SDK into your video player.

# Step 1: Installation and Setup:

Install the SDK using npm or another package manager of your choice:

```bash
npm i @fastpix/video-data-core
```

# Step 2: Import

```javascript
import fastpixMetrix from "@fastpix/video-data-core";
```

# Step 3: Basic Integration

Before using the FastPix Video Data Core SDK, ensure you have installed either HLS.js or DASH.js player libraries:

The `workspace_id` is a mandatory field that must be provided. Below are the 
integration steps for both HLS.js and DASH.js players.

## HLS.js Integration

```javascript
// Import HLS.js library for video streaming
import Hls from "hls.js";
import fastpixMetrix from "@fastpix/video-data-core";

// Reference to the video element
const videoPlayerElement = document.getElementById("video-player");
const initializationTime = fastpixMetrix.utilityMethods.now();

// Create a new HLS instance
const hlsPlayerInstance = new Hls();
hlsPlayerInstance.loadSource("YOUR_HLS_URL"); // Load the video stream
hlsPlayerInstance.attachMedia(videoPlayerElement);

// Custom dimensions for tracking
const trackingData = {
  workspace_id: "WORKSPACE_KEY", // Unique key to identify your workspace (replace with your actual workspace key)
  player_name: "Main Video Player", // A custom name or identifier for this video player instance
  player_init_time: initializationTime, // Timestamp of when the player was initialized (useful for tracking performance metrics)
  video_title: "VIDEO_TITLE", // Title of the video being played for analytics
  video_id: "VIDEO_ID", // Unique identifier for the video
  viewer_id: "VIEWER_ID", // Unique identifier for the viewer

  // Add any additional dimensions
};

// Pass both `hlsPlayerInstance` and `Hls` to the FastPix tracker for correct tracking
fastpixMetrix.tracker(videoPlayerElement, {
  debug: false, // Set to true to enable debug logs in the console
  hlsjs: hlsPlayerInstance, // Pass the `hlsPlayerInstance` created above
  Hls: Hls, // Pass the `Hls` constructor (imported)
  data: trackingData, // Attach custom metadata for analytics and tracking
});
```

## DASH.js Integration

```javascript
// Import DASH.js library for video streaming
import dashjs from "dashjs";
import fastpixMetrix from "@fastpix/video-data-core";

// Reference to the video element
const videoPlayerElement = document.getElementById("video-player");
const initializationTime = fastpixMetrix.utilityMethods.now();

// Create a new DASH.js instance
const dashPlayerInstance = dashjs.MediaPlayer().create();
dashPlayerInstance.initialize(videoPlayerElement, "YOUR_DASH_URL", false);

// Custom metadata for tracking
const trackingData = {
  workspace_id: "WORKSPACE_KEY", // Unique key to identify your workspace (replace with your actual workspace key)
  player_name: "Main Video Player", // A custom name or identifier for this video player instance
  player_init_time: initializationTime, // Timestamp of when the player was initialized (useful for tracking performance metrics)
  video_title: "VIDEO_TITLE", // Title of the video being played for analytics
  video_id: "VIDEO_ID", // Unique identifier for the video
  viewer_id: "VIEWER_ID", // Unique identifier for the viewer

  // Add any additional metadata
};

// Pass both `dashPlayerInstance` and `dashjs` to the FastPix tracker for correct tracking
fastpixMetrix.tracker(videoPlayerElement, {
  debug: false, // Set to true to enable debug logs in the console
  dashPlayer: dashPlayerInstance, // Pass the `dashPlayerInstance` created above
  dashjs: dashjs, // Pass the `dashjs` constructor (imported)
  data: trackingData, // Attach custom metadata for analytics and tracking
});
```

Once the player has loaded the URL and playback has started, the SDK will begin tracking the analytics. After playback ends, you can view the complete analytics report on your [FastPix dashboard](https://dashboard.fastpix.io).

# Step 4: Enhance Tracking with User Passable Metadata

Check out the [user-passable metadata](https://docs.fastpix.io/docs/user-passable-metadata-1) documentation to see the metadata supported by FastPix. You can use custom metadata fields like `custom_1` to `custom_10` for your business logic, giving you the flexibility to pass any required values. Named attributes, such as `video_title` and `video_id`, can be passed directly as they are.

```javascript
import fastpixMetrix from "@fastpix/video-data-core";

// Reference to the video element
const videoPlayerElement = document.getElementById("video-player");
const initializationTime = fastpixMetrix.utilityMethods.now();

// Custom metadata for tracking
const trackingData = {
  workspace_id: "WORKSPACE_KEY", // Unique key to identify your workspace (replace with your actual workspace key)
  player_name: "Main Video Player", // A custom name or identifier for this video player instance
  player_init_time: initializationTime, // Timestamp of when the player was initialized (useful for tracking performance metrics)
  video_title: "Test Content", // Title of the video being played (replace with the actual title of your video)
  video_id: "f01a98s76t90p88i67x", // A unique identifier for the video (replace with your actual video ID for tracking purposes)
  viewer_id: "user12345", // A unique identifier for the viewer (e.g., user ID, session ID, or any other unique value)
  video_content_type: "series", // Type of content being played (e.g., series, movie, etc.)
  video_stream_type: "on-demand", // Type of streaming (e.g., live, on-demand)

  // Custom fields for additional business logic
  custom_1: "", // Use this field to pass any additional data needed for your specific business logic
  custom_2: "", // Use this field to pass any additional data needed for your specific business logic

  // Add any additional metadata
};

// Pass both `hlsPlayerInstance` and `Hls` to the FastPix tracker for correct tracking
fastpixMetrix.tracker(videoPlayerElement, {
  debug: false, // Set to true to enable debug logs in the console
  data: trackingData, // Attach custom metadata for analytics and tracking
});

// To stop monitoring
// videoPlayerElement.fp.destroy();
```

### Note:

Keep metadata consistent across different video loads to make comparison easier in the dashboard.

# Step 5: Advanced Customization with FastPix Data SDK

| Attribute                | Description                                                                                                                                                                                                                                                                                                                                                  | Type    | Example Usage                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------- |
| `disableCookies`         | FastPix Data SDK uses cookies by default to track playback across page views and to identify unique viewers. If your application is not intended to collect cookies, you can disable this feature by setting `disableCookies: true`. This ensures that no cookies are set during the user's session, enhancing privacy and compliance with user preferences. | Boolean | `disableCookies: true`          |
| `respectDoNotTrack`      | Set to true to honor users' privacy preferences regarding the 'Do Not Track' setting.                                                                                                                                                                                                                                                                        | Boolean | `respectDoNotTrack: true`       |
| `automaticErrorTracking` | FastPix automatically tracks errors that occur during playback failures. To disable this feature, set `automaticErrorTracking` to false. This allows you to have more control over errors which are considered fatal and helps you manage error reporting according to your application's needs.                                                             | Boolean | `automaticErrorTracking: false` |
| `debug`                  | Set to true to enable debug logs in the console for troubleshooting purposes.                                                                                                                                                                                                                                                                                | Boolean | `debug: true`                   |

```javascript
// Reference to the video element
const videoPlayerElement = document.getElementById("video-player");

// Configuration for FastPix tracker
const trackingData = {
  debug: true, // Set to true to enable debug logs in the console
  disableCookies: true, // Set to true to disable cookies for tracking sessions and unique viewers
  respectDoNotTrack: true, // Set to true to honor users' 'Do Not Track' preferences
  automaticErrorTracking: false, // Set to false to disable automatic tracking of fatal errors
  data: {
    workspace_id: "WORKSPACE_KEY", // Replace with your actual workspace key

    // ... add other metadata as needed
  },
};

// Initialize the FastPix tracker with the configuration
fastpixMetrix.tracker(videoPlayerElement, trackingData);
```

# Step 6: Emit Custom Events

### Advanced Error Reporting and Contextual Tracking 

By default, FastPix tracks errors that occur during playback failures. However, you can also emit a custom error event for non-severe issues that arise outside of these failures, allowing you to provide additional context for tracking purposes.

```javascript
// videoPlayerElement is the HTML5 <video> element representing your video player. 
const videoPlayerElement = document.getElementById("video-player");

videoPlayerElement.fp.dispatch("error", {
	player_error_code: 1024, // Custom error code 
	player_error_message: "Description of error", // Generalized error message 
	player_error_context: "Additional context for the error", // Instance-specific information 
});
```

### Changing video streams in player

When your application plays multiple videos back-to-back in the same player, it's essential to notify the FastPix SDK whenever a new video starts; possibly in scenarios like playlist content/ video series or any other video that user wants to play.

```javascript
// videoPlayerElement is the HTML5 <video> element representing your video player. 
const videoPlayerElement = document.getElementById("video-player");

videoPlayerElement.fp.dispatch("videoChange", {
	video_id: "abc345", // Unique identifier for the new video 
	video_title: "My Other Great Video", // Title of the new video 
	video_series: "Weekly Great Videos", // Series name if applicable 

	// Additional metadata can be included here 
});
```

# Detailed Usage:

For more detailed steps and advanced usage, please refer to our official documentation:
- [HLS.js Monitoring Documentation](https://docs.fastpix.io/docs/monitor-hlsjs)
- [DASH.js Monitoring Documentation](https://docs.fastpix.io/docs/monitor-dashjs)
