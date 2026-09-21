## Why

The Shaka Player adapter satisfies almost none of the `video-data-parameters`
spec. A Shaka view reports a fraction of what an hls.js view of the same title
reports, so any customer running both cannot compare them, and any dashboard
built on the new fields is empty for Shaka traffic.

Two causes, and only one is about Shaka. The adapter supplies its own
`fetchStateData`, which the core substitutes for its own rather than merging, so
thirteen player-state fields the core already derives never leave the browser.
The rest is genuinely missing adapter work: the rendition payload is incomplete
and there is no ad tracking at all.

## What Changes

- Bump the core dependency so the adapter inherits pass-through metadata, viewer
  environment, view lifecycle, the pause split and the failure flags. These need
  no adapter code once the core merge lands.
- Complete the rendition payload so a single beacon describes one coherent
  rendition: width, height, audio codec and audio bitrate alongside the bitrate,
  codec and frame rate already reported.
- Add ad tracking, after establishing what Shaka exposes. This is the only part
  whose size is unknown.
- Publish a conformance declaration naming every requirement Shaka cannot
  satisfy, with the reason for each.
- Read the reported SDK version from the package rather than the hardcoded
  string, which is currently wrong.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change implements requirements the `video-data-parameters` spec
already states; it does not alter what any field means. The spec requirement
that an adapter composes with the core rather than replacing it already covers
the substitution defect.

## Impact

- `web-video-data-shakaplayer-sdk` — `src/index.ts`, the only source file
- Core dependency moves from `^1.0.7` to `^1.1.0`, and depends on the core
  merging adapter-supplied state rather than substituting it
- Published conformance declaration, new
- Blocked until investigated: whether Shaka's flattened presentation timeline
  preserves the descriptors that distinguish ad periods from content
