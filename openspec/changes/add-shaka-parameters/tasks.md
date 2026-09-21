## 1. Core composition

- [ ] 1.1 Change the core so an adapter-supplied `fetchStateData` is merged over
  the core's default rather than replacing it, and verify an adapter supplying
  only width and height still receives mute, volume and playback rate
- [ ] 1.2 Verify the hls.js and dash.js paths are unaffected, neither supplying
  `fetchStateData` today
- [ ] 1.3 Check whether either existing adapter relies on a field being absent,
  and record the finding before release
- [ ] 1.4 Release the core and bump the Shaka dependency, verifying the adapter
  builds and reports against the new version

## 2. Inherited groups

- [ ] 2.1 Verify pass-through metadata arrives unchanged, and that an omitted
  field is absent rather than empty
- [ ] 2.2 Verify viewer environment and page fields arrive with no adapter code
- [ ] 2.3 Verify view lifecycle, the content pause split and the three failure
  flags arrive, with the flags reporting false on a clean view
- [ ] 2.4 Verify the thirteen player-state fields now arrive from the core
  merge, and add an adapter override only where Shaka knows better than the
  media element
- [ ] 2.5 Verify picture-in-picture latches for the view rather than reporting
  instantaneous state

## 3. Rendition tracking

- [ ] 3.1 Extend the variant payload to carry width, height, audio codec and
  audio bitrate alongside the bitrate, codec and frame rate already reported,
  and verify one beacon never pairs one rendition's bitrate with another's
  resolution
- [ ] 3.2 Verify the reported bitrate is the whole variant inclusive of audio,
  by comparing against the manifest rather than by summing a second time
- [ ] 3.3 Derive the rendition name from the dimensions using the core's helper,
  and verify an 854x480 rendition reports 480p
- [ ] 3.4 Verify the upshift and downshift counters increment by direction, are
  seeded to zero, and do not count the first selection
- [ ] 3.5 Verify the initial rendition latches once and survives a later switch
- [ ] 3.6 Report dynamic range where Shaka exposes it, and record it unsupported
  with a reason if it does not

## 4. Ads

- [ ] 4.1 Investigate and record, before writing any ad code: what Shaka's
  advertisement interface exposes; whether it covers both HLS interstitials and
  DASH multi-period; and whether the asset identifiers distinguishing ad periods
  survive Shaka's flattening of the presentation into a single timeline
- [ ] 4.2 Record the chosen mechanism and its reasoning, or record every ad
  requirement as unsupported and close this group
- [ ] 4.3 Report break open and close with identity, position and duration, and
  verify a break containing three advertisements counts as one break
- [ ] 4.4 Report per-advertisement identity, index, duration and serving host,
  and verify the index orders correctly within a pod
- [ ] 4.5 Verify the time offset is reported on the content timeline, using a
  midroll preceded by a preroll
- [ ] 4.6 Verify an impression counts a rendered frame rather than a reached
  advertisement, and that a retried failure counts once
- [ ] 4.7 Verify ad playing time accrues from playback progress and never
  exceeds the declared duration, using a break that stalls
- [ ] 4.8 Verify an ad failure leaves `view_playback_failed` false and does not
  stop content metric collection
- [ ] 4.9 Guard every ad handler so a manifest shape the adapter did not
  anticipate costs the ad fields and nothing else

## 5. Housekeeping

- [ ] 5.1 Read the reported SDK version from the package rather than the
  hardcoded string, and verify the payload matches the published version

## 6. Conformance and release

- [ ] 6.1 Publish the conformance declaration naming every unsatisfied
  requirement with its reason, and verify no field is silently absent without an
  entry
- [ ] 6.2 Play the same title through Shaka and hls.js and verify comparable
  values for watch time, renditions and, where supported, ads
- [ ] 6.3 Changelog entry and README section
