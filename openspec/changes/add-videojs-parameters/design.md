## Context

See proposal.md — Why.

The adapter is a single file of roughly 570 lines. It wraps a Video.js player,
listens to its events, and hands state and events to the core.

Three facts shape the approach, and the third is what makes this change
different from the Shaka one.

**The core substitutes rather than merges.** An adapter-supplied
`fetchStateData` replaces the core's own. The adapter's returns eleven fields;
the core's returns twenty-two. This is a composition defect rather than a
Video.js limitation, and fixing it in the core is what makes this change small.

**Rendition data comes from the tech, not the player.** Video.js delegates
playback. The adapter already reaches past it, reading the bitrate from a
segment metadata track rather than from Video.js. Every other rendition field
requires reaching further in the same direction.

**Advertisements do not exist in Video.js.** There is no ad concept in the
player. Support comes entirely from plugins, and different plugins model
advertisements differently. "Video.js supports ads" is not a statement that can
be true or false until a plugin is named.

## Goals / Non-Goals

**Goals:**

- Parity for everything the adapter can source through Video.js or its tech
- An honest, published account of everything it cannot, including anything
  conditional on a plugin
- A stated position on advertisement plugins, whatever that position is

**Non-Goals:**

- Parsing manifests inside the adapter. If the tech does not expose it, the
  adapter does not invent it
- CMCD, which FastPix delivery rejects in both transports
- Supporting every advertisement plugin in the ecosystem

## Decisions

### Fix composition in the core, not in the adapter

Identical reasoning to the Shaka change, and the same core change serves both.
The adapter would otherwise restate values it reads from the same media element
the core reads, to defeat a substitution it did not ask for.

### Reach through to the tech for rendition data, and stop there

The adapter already does this for the bitrate. The remaining rendition fields
follow the same route.

Where the tech exposes nothing — a progressive source has no rendition concept
at all — the field is absent and recorded, rather than synthesised from the
media element's dimensions. The element's dimensions describe what is being
presented, not which rendition was selected, and the two diverge whenever the
player scales.

### Name the advertisement plugin, or declare ads unsupported

Three positions are available, and the change must take one.

Support a named plugin, in which case the adapter subscribes to that plugin's
advertisement lifecycle and the conformance declaration names the dependency.
The ad fields are absent when the plugin is not present, which is honest but
means two customers on Video.js can legitimately see different capabilities.

Support no plugin, in which case every advertisement requirement is recorded
unsupported. This is a perfectly conformant outcome and costs nothing to
maintain.

Attempt detection without a plugin, which is rejected. Server-side stitched
advertisements reach Video.js as ordinary content with no signal distinguishing
them. Inferring breaks from discontinuities or durations would invent breaks
that never happened, and an invented break is worse than an absent field.

This is a product decision. The engineering follows from it and is small in
either supported case.

### Ad rules, where implemented, are shared rather than reimplemented

The impression definition, the retry deduplication and the failure routing come
from shared code. Each was got wrong once already on the web path, and
independent implementations of rules that subtle diverge invisibly.

## Risks / Trade-offs

- **The core merge changes what existing adapters emit** → A field previously
  absent begins arriving. Checked before release rather than discovered by a
  customer.

- **Tech-specific reads break when the tech changes** → The adapter already
  depends on a segment metadata track shape. Extending that dependency widens
  the surface. Mitigated by guarding each read and recording the field
  unsupported rather than throwing.

- **Plugin-conditional ad support confuses customers** → The conformance
  declaration names the plugin explicitly, so a customer can tell before
  integrating whether the fields will populate.

- **The adapter is the largest of the three and grows further** → Every addition
  is either a tech read or a translation. Anything derivable belongs in the
  core.

## Migration Plan

1. Core merge ships first, shared with the Shaka change
2. Adapter bumps its dependency; the player-state group arrives with no adapter
   change, and is verified
3. Rendition completion through the tech
4. The advertisement decision, then either implementation or a declaration
5. Conformance declaration published alongside the release

Rollback is reverting the dependency bump.

## Open Questions

- Whether the segment metadata track exposes frame rate and codecs alongside the
  bandwidth it already provides. It changes which fields are supported but not
  the approach, so it can be answered during implementation.
