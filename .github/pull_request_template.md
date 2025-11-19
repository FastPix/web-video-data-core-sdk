# FastPix Video Data Core SDK - Documentation PR

## Documentation Changes

### What Changed
- [ ] New documentation added
- [ ] Existing documentation updated
- [ ] Documentation errors fixed
- [ ] Code examples updated
- [ ] Links and references updated
- [ ] Other

### Files Modified
- [ ] `README.md`
- [ ] `CHANGELOG.md`
- [ ] GitHub repository documentation
- [ ] External documentation (docs.fastpix.io)
- [ ] Other: _______________

### Summary
**Brief description of changes:**
```
<!-- What documentation was added, updated, or fixed? -->
```
### Code Examples (if Applicable)
```typescript
// If you added/updated code examples, include them here
import Hls from 'hls.js';
import fastpixMetrix from '@fastpix/video-data-core';

const videoPlayerElement = document.getElementById('video-player') as HTMLVideoElement;
const hls = new Hls();
hls.loadSource('YOUR_HLS_URL');
hls.attachMedia(videoPlayerElement);

fastpixMetrix.tracker(videoPlayerElement, {
  hlsjs: hls,
  Hls,
  data: { workspace_id: 'YOUR_WORKSPACE_KEY' },
});
```

### Testing
- [ ] All code examples tested
- [ ] Links verified
- [ ] Grammar checked
- [ ] Formatting consistent

### Review Checklist
- [ ] Content is accurate
- [ ] Code examples work
- [ ] Links are working
- [ ] Grammar is correct
- [ ] Formatting is consistent

---

**Ready for review!**

