## Why

The Video.js adapter satisfies almost none of the `video-data-parameters` spec.
A Video.js view reports a fraction of what an hls.js view of the same title
reports, so a customer running both cannot compare them and any dashboard built
on the new fields is empty for Video.js traffic.

Two causes, and only one is about Video.js. The adapter supplies its own
`fetchStateData`, which the core substitutes for its own rather than merging, so
thirteen player-state fields the core already derives never leave the browser.
The rest is genuinely missing adapter work: the rendition payload reports a
bitrate and nothing else, and there is no ad tracking.

Video.js differs from the other integrations in one way that shapes everything.
It is a player shell rather than a playback engine — it delegates to a tech, and
on streaming sources that tech is what actually knows the rendition. Several
fields therefore come from the tech rather than from Video.js, and ads exist
only when a plugin provides them.

## What Changes

- Bump the core dependency so the adapter inherits pass-through metadata, viewer
  environment, view lifecycle, the pause split and the failure flags. These need
  no adapter code once the core merge lands.
- Complete the rendition payload beyond the bitrate it reports today, sourcing
  from the active tech where Video.js itself does not know.
- Decide which advertisement plugin, if any, is in scope, and either implement
  against it or record every ad requirement as unsupported.
- Publish a conformance declaration naming every requirement the adapter cannot
  satisfy, with the reason for each, including the plugin dependency where one
  exists.
- Read the reported SDK version from the package rather than the hardcoded
  string, which is currently wrong.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change implements requirements the `video-data-parameters` spec
already states; it does not alter what any field means. The spec requirements
covering adapter composition and per-integration ad declaration already cover
the two structural issues here.

## Impact

- `web-videojs-data-monitoring` — `src/index.ts`, the only source file
- Core dependency bump, and dependence on the core merging adapter-supplied
  state rather than substituting it
- A declared position on advertisement plugins, which is a product decision
  rather than an engineering one
- Published conformance declaration, new
