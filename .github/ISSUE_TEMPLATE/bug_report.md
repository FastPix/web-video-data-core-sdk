---
name: Bug Report
about: Report a bug or unexpected behavior in the FastPix Video Data Core SDK
title: '[BUG] '
labels: ['bug', 'needs-triage']
assignees: ''
---

# Bug Report

Thank you for taking the time to report a bug with the FastPix Video Data Core SDK. To help us resolve your issue quickly and efficiently, please provide the following information:

## Description
**Clear and concise description of the bug:**
```
<!-- Please provide a detailed description of what you're experiencing -->
```
## Environment Information

### System Details
- **Operating System:** [e.g., Windows 10, macOS 12.0, Ubuntu 20.04, etc.]
- **Browser:** [e.g., Chrome 120, Firefox 121, Safari 17, Edge 120, etc.]
- **Browser Version:** [e.g., 120.0.6099.109, etc.]
- **Package Manager:** [e.g., npm, yarn, pnpm, bun]

### SDK Information
- **FastPix Video Data Core SDK Version:** [e.g., 1.0.6, 1.0.5, etc.]
- **Player Library:** [e.g., HLS.js v1.4.12, DASH.js v4.7.3, etc.]
- **Player Library Version:** [e.g., 1.4.12, 4.7.3, etc.]
- **Framework:** [e.g., React, Vue, Angular, Vanilla JS, etc.] (if applicable)

## Reproduction Steps

1. **Setup Environment:**
   ```bash
   npm install @fastpix/video-data-core@latest
   ```

2. **Code to Reproduce:**
   ```javascript
   // Please provide a minimal, reproducible example
   import Hls from "hls.js"; // or import dashjs from "dashjs";
   import fastpixMetrix from "@fastpix/video-data-core";
   
   const videoPlayerElement = document.getElementById("video-player");
   const initializationTime = fastpixMetrix.utilityMethods.now();
   
   // HLS.js example
   const hlsPlayerInstance = new Hls();
   hlsPlayerInstance.loadSource("YOUR_HLS_URL");
   hlsPlayerInstance.attachMedia(videoPlayerElement);
   
   const trackingData = {
     workspace_id: "WORKSPACE_KEY",
     player_name: "Main Video Player",
     player_init_time: initializationTime,
     video_title: "VIDEO_TITLE",
     video_id: "VIDEO_ID",
     viewer_id: "VIEWER_ID",
   };
   
   fastpixMetrix.tracker(videoPlayerElement, {
     debug: false,
     hlsjs: hlsPlayerInstance,
     Hls: Hls,
     data: trackingData,
   });
   
   // Your code here that causes the issue
   ```

3. **Expected Behavior:**

    ```
    <!-- Describe what you expected to happen -->
    ```

4. **Actual Behavior:**

    ```
    <!-- Describe what actually happened -->
    ```

5. **Error Messages/Logs:**
   ```
   <!-- Paste any error messages, stack traces, or logs here -->
   ```

## Debugging Information

### Console Output
```
<!-- Paste the complete console output here -->
```

### Error Stack Traces
```javascript
// Complete stack trace for JavaScript/TypeScript errors
// Example: HLS.js error
Error: FastPix Video Data Core SDK Error: Failed to initialize tracker
    at Tracker.initialize (fastpixMetrix.tracker:45:12)
    at HTMLVideoElement.initializeTracker (video-player.js:23:8)
    at window.loadVideo (main.js:15:3)

// Example: DASH.js error
Error: FastPix Video Data Core SDK Error: A valid video element is required
    at fastpixMetrix.tracker (video-player.js:45:12)
    at initializePlayer (player-setup.js:23:8)
```

### Network Requests
```http
# Raw HTTP request (remove sensitive headers)
POST /api/v1/analytics HTTP/1.1
Host: analytics.fastpix.io
Content-Type: application/json

{
  "workspace_id": "WORKSPACE_KEY",
  "player_name": "Main Video Player",
  "video_id": "VIDEO_ID"
}
```

### Screenshots
```
<!-- If applicable, please attach screenshots that help explain your issue -->
```
## Additional Context

### Configuration
```javascript
// Please share your SDK configuration (remove sensitive information)
fastpixMetrix.tracker(videoPlayerElement, {
  debug: false,
  hlsjs: hlsPlayerInstance,
  Hls: Hls,
  data: {
    workspace_id: "***",
    player_name: "MyVideoPlayer",
    player_init_time: initializationTime,
    video_title: "Test Video",
    video_id: "video-123",
    viewer_id: "viewer-456",
  },
  // Any other configuration options
});
```

### Workarounds
```
<!-- If you've found any workarounds, please describe them here -->
```
## Priority
Please indicate the priority of this bug:

- [ ] Critical (Blocks production use)
- [ ] High (Significant impact on functionality)
- [ ] Medium (Minor impact)
- [ ] Low (Nice to have)

## Checklist
Before submitting, please ensure:

- [ ] I have searched existing issues to avoid duplicates
- [ ] I have provided all required information
- [ ] I have tested with the latest SDK version
- [ ] I have removed any sensitive information
- [ ] I have provided a minimal reproduction case
- [ ] I have checked the documentation

---

**Thank you for helping improve the FastPix Video Data Core SDK! 🚀**
