---
name: Question/Support
about: Ask questions or get help with the FastPix Video Data Core SDK
title: '[QUESTION] '
labels: ['question', 'needs-triage']
assignees: ''
---

# Question/Support

Thank you for reaching out! We're here to help you with the FastPix Video Data Core SDK. Please provide the following information:

## Question Type
- [ ] How to use a specific feature
- [ ] Integration help
- [ ] Configuration question
- [ ] Performance question
- [ ] Troubleshooting help
- [ ] Other: _______________

## Question
**What would you like to know?**
```
<!-- Please provide a clear, specific question -->
```
## What You've Tried
**What have you already attempted to solve this?**

```typescript
// Please share any code you've tried (browser-based)
import fastpixMetrix from '@fastpix/video-data-core';
// If applicable:
// import Hls from 'hls.js';
// import dashjs from 'dashjs';

// Your attempted code here
```

## Current Setup
**Describe your current setup:**

### Environment
- **Operating System:** [e.g., Windows 10, macOS 12.0, Ubuntu 20.04, etc.]
- **Browser:** [e.g., Chrome, Firefox, Safari, Edge]
- **Browser Version:** [e.g., 120.0.6099.109, 121.0, 17.0]
- **FastPix Video Data Core SDK Version:** [e.g., 1.0.6, 1.0.5]
- **Player Library and Version:** [e.g., HLS.js 1.4.12, DASH.js 4.7.3]

### Configuration
```typescript
// Your current SDK configuration (remove sensitive information)
import fastpixMetrix from '@fastpix/video-data-core';
// If using HLS.js:
// import Hls from 'hls.js';
// const hls = new Hls();
// hls.loadSource('YOUR_HLS_URL');
// hls.attachMedia(videoPlayerElement);

const videoPlayerElement = document.getElementById('video-player') as HTMLVideoElement;

// Paste the exact tracker call you used
fastpixMetrix.tracker(videoPlayerElement, {
  // e.g., hlsjs: hls, Hls,
  // or dashPlayer, dashjs
  // data: { workspace_id: '***', ... }
});
```

## Expected Outcome
**What are you trying to achieve?**
```
<!-- Describe your end goal -->
```
## Error Messages (if any)
```
<!-- If you're getting errors, paste them here -->
```

## Additional Context

### Use Case
**What are you building?**

- [ ] Web application
- [ ] Mobile app (web-based)
- [ ] Video streaming platform
- [ ] Video player integration
- [ ] Other: _______________

### Timeline
**When do you need this resolved?**

- [ ] ASAP (blocking development)
- [ ] This week
- [ ] This month
- [ ] No rush

### Resources Checked
**What resources have you already checked?**

- [ ] README.md
- [ ] Documentation
- [ ] Examples
- [ ] Stack Overflow
- [ ] GitHub Issues
- [ ] Other: _______________

## Priority
Please indicate the urgency:

- [ ] Critical (Blocking production deployment)
- [ ] High (Blocking development)
- [ ] Medium (Would like to know soon)
- [ ] Low (Just curious)

## Checklist
Before submitting, please ensure:

- [ ] I have provided a clear question
- [ ] I have described what I've tried
- [ ] I have included my current setup
- [ ] I have checked existing documentation
- [ ] I have provided sufficient context
- [ ] I have removed any sensitive information

---

**We'll do our best to help you get unstuck! 🚀**

**For urgent issues, please also consider:**
- [FastPix Documentation](https://docs.fastpix.io/)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/fastpix)
- [GitHub Discussions](https://github.com/FastPix/web-video-data-core-sdk/discussions)
