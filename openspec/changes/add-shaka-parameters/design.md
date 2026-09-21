## Context

See proposal.md — Why.

The adapter is a single file of roughly 380 lines. It constructs a state object,
dispatches a handful of events, and hands both to the core. It is thin by
design, and the work here should keep it thin.

Three facts shape the approach.

**The core substitutes rather than merges.** An adapter-supplied
`fetchStateData` replaces the core's own. Shaka's returns twelve fields; the
core's returns twenty-two. The difference is not a Shaka limitation — it is a
composition defect, and fixing it in the core is what makes this change small.

**Shaka's variant tracks already pair video with audio.** Where the DASH path
has to reconcile two independent callbacks and currently gets it wrong, Shaka
hands over a single object describing the whole variant. The coherence
requirement is therefore easy to satisfy here.

**Shaka flattens the presentation.** From version 3 it presents a multi-period
DASH stream as one timeline. Whether the asset identifiers that distinguish ad
periods survive that flattening is unknown and decides the entire ad section.

## Goals / Non-Goals

**Goals:**

- Parity with the hls.js integration for everything Shaka can source
- An honest, published account of everything it cannot
- No growth in adapter complexity beyond what the fields require

**Non-Goals:**

- Reimplementing derivation the core already performs
- CMCD, which FastPix delivery rejects in both transports
- Inferring ad breaks from anything other than an explicit signal

## Decisions

### Fix composition in the core, not in the adapter

The alternative is to have the adapter restate every field the core already
reads — mute, volume, rate, loop, controls, picture-in-picture, subtitles.

Rejected. Those values come from the same media element the core reads, so the
adapter would be copying working code to defeat a substitution it did not ask
for. It also scales badly: every future adapter repeats it, and each copy drifts
independently.

Merging in the core costs one change and fixes both existing adapters plus any
future one. The risk is an adapter that currently relies on a field being
absent, which is checked as a task rather than assumed.

### Report the variant as Shaka describes it

Shaka's active variant carries bandwidth, video codec, audio codec and frame
rate together. The adapter reports that object as one update.

It specifically does **not** sum a separate audio rate into the bandwidth. Shaka
already accounts for audio in the variant bandwidth, and adding it again would
overstate the rate — the mirror image of the DASH defect, where the audio rate
was omitted and later found to be silently zero.

### Investigate ads before designing them

No ad code is written until task 4.1 reports. Three outcomes, each implying a
different design:

Shaka's own advertisement interface covers both delivery mechanisms, in which
case the adapter subscribes to it and the work is small.

Ad periods remain observable in Shaka's manifest model, in which case the
adapter applies the same asset-identifier rules the DASH path uses, and the
shared-or-forked question below becomes pressing.

Neither holds, in which case every ad requirement is recorded unsupported and
the change closes without ad code. That is a legitimate outcome, not a failure.

### Ad rules are shared with the core, not reimplemented

Where ad detection is possible, the content-asset rule, the impression
definition, the retry deduplication and the failure routing come from shared
code rather than a second implementation.

Each of those was got wrong once already on the web path. Four independent
implementations of rules that subtle will diverge, and the divergence will be
invisible until a customer compares two players and finds different numbers for
the same stream.

## Risks / Trade-offs

- **The core merge changes what existing adapters emit** → A field previously
  absent begins arriving. Checked explicitly before release rather than
  discovered by a customer.

- **Shaka's flattening may hide ad boundaries entirely** → Recorded as
  unsupported with the reason stated, rather than inferred from durations or
  discontinuities. An absent field is conformant; an invented break is not.

- **Shaka's ad interface may cover only one delivery mechanism** → Declared per
  mechanism rather than as "ads supported", so a DASH customer is not told a
  feature works when it does not.

- **The adapter grows into a second core** → Every addition is either a value
  the core cannot read, or a translation of something Shaka exposes. Anything
  else belongs in the core.

## Migration Plan

1. Core merge ships first, on its own
2. Adapter bumps its dependency; the player-state group arrives with no adapter
   change, and is verified
3. Rendition completion
4. Ads, estimated separately after the investigation
5. Conformance declaration published alongside the release

Rollback is reverting the dependency bump; the adapter's own additions are
additive and inert without it.

## Open Questions

- Whether Shaka exposes dynamic range for the active variant. It changes one
  field and its conformance entry, nothing structural, so it can be answered
  during implementation.
