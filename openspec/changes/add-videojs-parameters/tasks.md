## 1. Core composition

- [ ] 1.1 Verify the core's merged `fetchStateData` change has shipped, shared
  with the Shaka change, and bump the Video.js dependency
- [ ] 1.2 Verify the adapter builds against the new core and reports the new
  version

## 2. Inherited groups

- [ ] 2.1 Verify pass-through metadata arrives unchanged, and that an omitted
  field is absent rather than empty
- [ ] 2.2 Verify viewer environment and page fields arrive with no adapter code
- [ ] 2.3 Verify view lifecycle, the content pause split and the three failure
  flags arrive, with the flags reporting false on a clean view
- [ ] 2.4 Verify the thirteen player-state fields now arrive from the core
  merge, given Video.js wraps the media element the core reads
- [ ] 2.5 Override subtitles from Video.js's own text track handling if the
  element's tracks do not reflect the player's UI, and verify against a source
  with captions
- [ ] 2.6 Verify picture-in-picture latches for the view rather than reporting
  instantaneous state

## 3. Rendition tracking

- [ ] 3.1 Establish and record where each rendition attribute comes from, given
  Video.js delegates to a tech and the adapter already reads the bitrate from a
  segment metadata track rather than from the player
- [ ] 3.2 Extend the variant payload with width, height, codec, frame rate,
  audio codec and audio bitrate where the tech exposes them, and verify one
  beacon never pairs one rendition's bitrate with another's resolution
- [ ] 3.3 Verify the reported bitrate is the whole variant inclusive of audio
- [ ] 3.4 Derive the rendition name from the dimensions using the core's helper,
  and verify an 854x480 rendition reports 480p
- [ ] 3.5 Verify the upshift and downshift counters increment by direction, are
  seeded to zero, and do not count the first selection
- [ ] 3.6 Verify the initial rendition latches once and survives a later switch
- [ ] 3.7 Record as unsupported, with reasons, every rendition attribute the
  tech does not expose, and verify a progressive source reports none of them
  rather than substituting the media element's presented dimensions

## 4. Ads

- [ ] 4.1 Decide and record whether an advertisement plugin is in scope, and if
  so which. This is a product decision; the engineering follows from it
- [ ] 4.2 If no plugin is in scope, record every advertisement requirement as
  unsupported with the reason, verify the adapter emits no ad fields, and close
  this group
- [ ] 4.3 If a plugin is in scope, subscribe to its advertisement lifecycle and
  report break open and close with identity, position and duration, verifying a
  break containing three advertisements counts as one break
- [ ] 4.4 Report per-advertisement identity, index, duration and serving host
  where the plugin exposes them
- [ ] 4.5 Verify an impression counts a rendered frame rather than a reached
  advertisement, and that a retried failure counts once
- [ ] 4.6 Verify ad playing time accrues from playback progress and never
  exceeds the declared duration
- [ ] 4.7 Verify an ad failure leaves `view_playback_failed` false and does not
  stop content metric collection
- [ ] 4.8 Verify the ad fields are absent, rather than zero, when the named
  plugin is not present
- [ ] 4.9 Guard every ad handler so a plugin state the adapter did not
  anticipate costs the ad fields and nothing else

## 5. Housekeeping

- [ ] 5.1 Read the reported SDK version from the package rather than the
  hardcoded string, and verify the payload matches the published version

## 6. Conformance and release

- [ ] 6.1 Publish the conformance declaration naming every unsatisfied
  requirement with its reason, naming the advertisement plugin dependency where
  one exists, and verify no field is silently absent without an entry
- [ ] 6.2 Play the same title through Video.js and hls.js and verify comparable
  values for watch time and renditions
- [ ] 6.3 Changelog entry and README section
