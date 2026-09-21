# video-data-parameters Specification

## Purpose
Defines every parameter a FastPix data SDK reports beyond the original core set:
what each field means, where its value may come from, and what its absence
signifies. One contract for every player integration, so that a single telemetry
column carries the same meaning regardless of which player produced it.

Three principles run through the whole document. A field an implementation
cannot source correctly is left absent rather than substituted, because a wrong
value is worse than a missing one. A measurement of what a viewer watched
accrues only while media is advancing, never from wall clock. And a value the
integrator supplies is never confused with one the SDK measured.

## Requirements

### Requirement: Supplied values are carried verbatim

The SDK SHALL transport integrator-supplied fields unchanged. It SHALL NOT
normalise, validate, truncate, reformat or reject a supplied value.

The fields governed by this requirement are `application_name`,
`application_version`, `content_id`, `device_id`, `page_type`, `viewer_plan`,
`viewer_plan_category`, `viewer_plan_status`, `video_brand`, `video_affiliate`,
`video_creator_id`, `video_description`, `video_media_tags`, `video_codec`,
`video_audio_codec`, `video_dynamic_range_type`, `view_drm_level`,
`view_cdn_edge_pop`, `view_cdn_origin`, `view_time_shift_enabled`,
`player_captions_enabled` and `player_pip_enabled`.

#### Scenario: A value is supplied

- **WHEN** the application supplies `page_type` as `"video_detail_page"`
- **THEN** the beacon reports exactly `"video_detail_page"`

#### Scenario: A value differs only in case from another session's

- **WHEN** one session supplies `"watch"` and another supplies `"Watch"`
- **THEN** both are reported as given, producing two distinct values

### Requirement: An unsupplied field is absent, not defaulted

Where the application supplies no value, the SDK SHALL omit the field. It SHALL
NOT substitute an empty string, a zero, a false, or a value derived from
elsewhere.

Absence of an integrator-supplied field SHALL NOT be treated as a defect.

#### Scenario: A field is not supplied

- **WHEN** the application supplies no `viewer_plan`
- **THEN** `viewer_plan` is absent from the beacon

#### Scenario: A boolean capability field is not supplied

- **WHEN** the application supplies no `player_pip_enabled`
- **THEN** the field is absent rather than reported as false

### Requirement: Supplied values never override measurements

Where a supplied field names the same subject as a field the SDK measures, the
two SHALL be reported independently and the supplied value SHALL NOT replace the
measured one.

#### Scenario: Declared and measured codecs disagree

- **WHEN** the application supplies `video_codec` as `"h264"` and the active
  rendition declares `"avc1.64001e"`
- **THEN** `video_codec` reports `"h264"`
- **AND** the measured rendition codec reports `"avc1.64001e"`

### Requirement: Supplied values survive a view boundary

The SDK SHALL re-apply the supplied values to each new view within a session, so
that a second video reports the same application-level metadata as the first
unless the application changes it.

#### Scenario: A second video is loaded

- **WHEN** a new source is loaded without the application supplying new metadata
- **THEN** the previously supplied values are reported on the new view

### Requirement: Capability fields describe availability, not use

`player_captions_enabled`, `player_pip_enabled` and `view_time_shift_enabled`
SHALL be understood as declarations that the application offers a feature, not
as observations that a viewer used it.

Each SHALL have a corresponding observed field where one exists, and the two
SHALL be reported independently so that use without availability remains
visible.

#### Scenario: A feature is used without being offered

- **WHEN** the application declares `player_pip_enabled` as false and the viewer
  enters picture in picture through a browser menu
- **THEN** `player_pip_enabled` reports false
- **AND** the observed picture-in-picture field reports true

### Requirement: Environment is captured once, at initialisation

The SDK SHALL read every environment field when monitoring begins, and SHALL NOT
update them for the remainder of the session.

A change to the environment during a session — the window resized, the network
changed, a permission altered — SHALL NOT be reflected until a new session
begins.

#### Scenario: The window is resized mid-playback

- **WHEN** the viewer resizes the window after playback has begun
- **THEN** the reported viewport dimensions are unchanged

#### Scenario: The page is reloaded after a resize

- **WHEN** the viewer resizes the window and reloads the page
- **THEN** the new dimensions are reported

### Requirement: The viewing surface is measured as the viewport

`viewer_browser_width` and `viewer_browser_height` SHALL report the dimensions of
the page's viewport in CSS pixels, not those of the window or the screen.

The measurement SHALL include any scrollbar, and SHALL exclude browser chrome and
any docked developer tooling that reduces the viewport.

#### Scenario: Developer tooling is docked to the bottom

- **WHEN** the viewport is reduced by tooling docked below it
- **THEN** the reported height is the reduced value

#### Scenario: The page is zoomed

- **WHEN** the viewer views the page at 125 per cent zoom
- **THEN** the reported width is in CSS pixels and is smaller than the device
  pixel width

### Requirement: Orientation describes the viewing surface

`viewer_device_orientation` SHALL be derived by comparing the reported viewport
width against its height, and SHALL describe the shape of the viewing surface
rather than the physical orientation of the hardware.

#### Scenario: A desktop window is taller than it is wide

- **WHEN** the viewport is narrower than it is tall on a landscape display
- **THEN** `viewer_device_orientation` reports portrait

### Requirement: Storage and tracking preferences are reported as the browser states them

`viewer_cookies_enabled` SHALL report whether the browser permits this document
to store cookies, and `viewer_dnt_on` SHALL report whether the browser sent a Do
Not Track signal.

Both SHALL reflect the browser only. Neither SHALL be affected by the SDK's own
configuration options governing cookie use or Do Not Track compliance.

#### Scenario: The SDK is configured not to write cookies

- **WHEN** the application disables the SDK's cookie use and the browser permits
  cookies
- **THEN** `viewer_cookies_enabled` reports true

#### Scenario: A browser exposes no tracking preference

- **WHEN** the browser provides no Do Not Track signal
- **THEN** `viewer_dnt_on` reports false

### Requirement: Locale and connection are reported where the browser exposes them

`viewer_timezone_name` SHALL report the viewer's timezone as an IANA identifier.

`viewer_connection_speed` SHALL report the browser's own classification of the
connection. Where a browser exposes no such classification, the field SHALL be
absent rather than guessed.

#### Scenario: A browser exposes no connection information

- **WHEN** the browser provides no connection classification
- **THEN** `viewer_connection_speed` is absent

### Requirement: The hosting page is identified

`page_title`, `page_referrer_url` and `page_site_domain` SHALL report the
document's title, the address the viewer navigated from, and the host serving the
page.

Where the SDK runs inside an embedded frame, these SHALL describe that frame's
document rather than the page containing it.

Where there is no referrer, `page_referrer_url` SHALL report an empty value
rather than being omitted.

#### Scenario: The page is opened directly

- **WHEN** the viewer opens the page without following a link
- **THEN** `page_referrer_url` reports an empty value

#### Scenario: The player runs in an embedded frame

- **WHEN** the player is embedded in a frame on another site
- **THEN** `page_site_domain` reports the frame document's host

### Requirement: Environment fields are absent outside a browser

Where no browser environment is present, the SDK SHALL omit the environment
fields rather than reporting a substituted value.

An absent field SHALL be distinguishable from a measured negative: absence
indicates no browser, not a viewer who declined.

#### Scenario: No browser environment exists

- **WHEN** the SDK runs where no browser globals are available
- **THEN** the environment fields are absent rather than false or zero

### Requirement: Viewer-controlled playback state is reported as it stands

The SDK SHALL report the current mute state, volume, playback rate, loop setting
and native-controls setting of the media element in `player_muted`,
`player_volume_level`, `player_playback_rate`, `player_loop_on` and
`player_controls_on`.

`player_volume_level` SHALL be reported on the media element's own scale of zero
to one, not as a percentage.

#### Scenario: The viewer changes volume and speed

- **WHEN** the viewer sets volume to half and playback rate to double
- **THEN** `player_volume_level` reports 0.5
- **AND** `player_playback_rate` reports 2

### Requirement: Defaults are distinguishable from current state

`player_default_muted_on` and `player_default_playback_rate` SHALL describe the
state the application configured, and SHALL NOT follow a change the viewer makes
during playback.

`player_default_playback_rate` SHALL be captured once, when monitoring begins.
Some browsers write the element's default rate alongside the current rate when
the viewer uses a native speed control, so re-reading it later would report the
viewer's choice as the application's default and the two fields could never
disagree.

#### Scenario: The viewer changes speed

- **WHEN** the application starts playback at normal speed and the viewer
  selects double speed
- **THEN** `player_playback_rate` reports 2
- **AND** `player_default_playback_rate` still reports 1

#### Scenario: The viewer unmutes an autoplaying video

- **WHEN** playback starts muted and the viewer unmutes it
- **THEN** `player_muted` reports false
- **AND** `player_default_muted_on` still reports true

### Requirement: Active text and audio tracks are reported

The SDK SHALL report whether a text track is currently showing in
`player_subtitles_on`, and the language of that track in
`player_subtitles_language_code`.

The SDK SHALL report the language of the active audio track in
`player_audio_language_code`.

Where a manifest declares a language as undetermined, the SDK SHALL report an
empty value rather than passing the placeholder through.

#### Scenario: The viewer enables captions

- **WHEN** the viewer switches on an English subtitle track
- **THEN** `player_subtitles_on` reports true
- **AND** `player_subtitles_language_code` reports the track's language

#### Scenario: The manifest declares no audio language

- **WHEN** the active audio track declares its language as undetermined
- **THEN** `player_audio_language_code` reports an empty value

### Requirement: Picture in picture reports use, not instantaneous state

`player_is_pip` SHALL report whether picture in picture was entered at any point
during the view, and SHALL remain true after the viewer leaves it.

The SDK SHALL observe entry through the media element's own events rather than by
sampling when a beacon is built, since picture in picture is typically entered
and left between two beacons.

The SDK SHALL observe entry on browsers implementing picture in picture through
presentation mode as well as those implementing the standard interface.

Fullscreen SHALL NOT be reported as picture in picture.

The field SHALL reset when a new source is loaded.

#### Scenario: The viewer uses and then leaves picture in picture

- **WHEN** the viewer enters picture in picture, watches, leaves it, and later
  ends the view
- **THEN** `player_is_pip` reports true

#### Scenario: The viewer enters fullscreen

- **WHEN** the viewer enters fullscreen and never uses picture in picture
- **THEN** `player_is_pip` reports false

#### Scenario: A second video is loaded

- **WHEN** picture in picture was used on one source and a new source is loaded
- **THEN** `player_is_pip` reports false for the new view

### Requirement: Player visibility is reported

The SDK SHALL report whether the player is on screen in `player_viewable_on`,
and how much of it is within the viewport in `player_viewable_percentage` on a
scale of zero to one hundred.

Geometric visibility alone SHALL NOT be sufficient: a player in a hidden tab
SHALL be reported as not viewable, whatever its position on the page.

#### Scenario: The player is scrolled half out of view

- **WHEN** half the player's area is inside the viewport
- **THEN** `player_viewable_percentage` reports approximately 50

#### Scenario: The tab is backgrounded

- **WHEN** the player is fully within the viewport and the tab is hidden
- **THEN** `player_viewable_on` reports false
- **AND** `player_viewable_percentage` reports 0

### Requirement: Playhead position is mapped to wall-clock time where available

Where the stream carries wall-clock timing, the SDK SHALL report the current
playhead position as epoch milliseconds in `player_program_date_time`.

Where the stream carries no such timing, the field SHALL be absent.

#### Scenario: An on-demand stream without wall-clock timing

- **WHEN** the stream carries no wall-clock timing information
- **THEN** `player_program_date_time` is absent

### Requirement: Error severity and classification are reported

The SDK SHALL report the severity of the most recent error in
`player_error_severity`, and whether that error was a business rule rather than
a technical failure in `player_error_business_exception`.

An error SHALL be recorded only when it carries at least one of a code, a message
or a context. An error carrying none of these SHALL clear the error fields rather
than record an empty error.

`player_error_business_exception` SHALL describe the most recent error only, and
SHALL be rewritten on each error rather than carried forward.

A severity of warning SHALL NOT escalate to a view-level failure.

#### Scenario: An error arrives with no identifying information

- **WHEN** an error is reported with no code, message or context
- **THEN** all error fields are cleared

#### Scenario: A business exception is followed by a technical error

- **WHEN** a business exception is reported and a technical error follows it
- **THEN** `player_error_business_exception` reports false
- **AND** the view-level business exception flag remains true

#### Scenario: A warning is reported

- **WHEN** an error is reported with severity warning
- **THEN** `player_error_severity` reports warning
- **AND** no view-level failure flag is set

### Requirement: The monitoring SDK identifies itself

The SDK SHALL report its own name and version in `player_fastpix_sdk_name` and
`player_fastpix_sdk_version`, and SHALL identify the specific integration rather
than the family.

#### Scenario: Two integrations report from the same session shape

- **WHEN** one view is monitored through an HLS integration and another through a
  Shaka integration
- **THEN** `player_fastpix_sdk_name` differs between them

### Requirement: Player initialisation time anchors startup measurement

`player_init_time` SHALL carry the time the application constructed the player,
and SHALL be used as the baseline against which player startup is measured.

#### Scenario: Startup is measured

- **WHEN** the application supplies the time it constructed the player
- **THEN** player startup time is measured from that value rather than from when
  monitoring began

### Requirement: Bitrate is the variant peak rate including audio

`video_source_bitrate` SHALL be the declared peak bitrate of the selected
variant, inclusive of every rendition played alongside it — video and its
accompanying audio.

The SDK SHALL prefer the value declared by the manifest. Where a manifest
declares a video-only rate, the SDK SHALL add the bitrate of the audio rendition
in use before reporting.

The SDK SHALL NOT report a measured or estimated throughput in this field.

#### Scenario: Manifest declares a variant rate

- **WHEN** the manifest declares a variant peak rate of 1500000 that already
  accounts for the audio rendition it references
- **THEN** `video_source_bitrate` reports 1500000

#### Scenario: Manifest declares video and audio separately

- **WHEN** the manifest declares a video representation of 1372000 and the
  active audio representation is 128000
- **THEN** `video_source_bitrate` reports 1500000

#### Scenario: Measured throughput diverges from the declared rate

- **WHEN** the declared rate is 1500000 and measured throughput is 830000
- **THEN** `video_source_bitrate` still reports 1500000

### Requirement: Initial rendition is latched once per view

The SDK SHALL record the rendition active when playback begins and SHALL NOT
revise those values when the rendition changes later in the same view.

The latched set SHALL be `view_initial_bitrate`, `view_initial_fps`,
`view_initial_source_width`, `view_initial_source_height`,
`view_initial_source_codec`, `view_initial_audio_codec` and
`view_initial_dynamic_range_type`.

The SDK SHALL latch on the first rendition selection that reports a bitrate
greater than zero. A selection reporting no bitrate SHALL NOT latch.

The SDK SHALL clear the latched set at a view boundary, so that a subsequent
video in the same session latches its own values.

#### Scenario: Rendition drops after playback begins

- **WHEN** playback begins on a 1500000 rendition at 854x480 and later switches
  to 500000 at 480x270
- **THEN** `view_initial_bitrate` remains 1500000
- **AND** `view_initial_source_width` remains 854
- **AND** `video_source_bitrate` reports 500000

#### Scenario: Renditions differ by codec

- **WHEN** playback begins on a rendition declaring `avc1.64001e` and later
  switches to one declaring `avc1.640016`
- **THEN** `view_initial_source_codec` remains `avc1.64001e`

#### Scenario: First selection reports no bitrate

- **WHEN** the first rendition selection reports a bitrate of zero or none
- **THEN** no initial-rendition field is written
- **AND** the next selection reporting a positive bitrate latches instead

#### Scenario: A second video is loaded

- **WHEN** a new source is loaded in the same session
- **THEN** every initial-rendition field re-latches to the new source's first
  rendition

### Requirement: Rendition changes are counted by direction

The SDK SHALL count each rendition change whose bitrate differs from the
previous rendition, incrementing `view_rendition_upshift_count` when the bitrate
increases and `view_rendition_downshift_count` when it decreases.

The SDK SHALL report the signed difference in `video_source_bitrate_shift`,
negative for a decrease.

The SDK SHALL compare bitrates numerically. A lexicographic comparison is
non-conformant.

The first rendition selection of a view SHALL NOT be counted, as it establishes
the starting rendition rather than changing it. A change reporting an identical
bitrate SHALL NOT be counted.

Both counters SHALL be reported as zero once a rendition has been selected, so
that a view in which no change occurred is distinguishable from one in which the
counters were never populated.

#### Scenario: Quality drops then recovers

- **WHEN** playback moves 1500000 to 500000, then 500000 to 1500000
- **THEN** `view_rendition_downshift_count` is 1
- **AND** `view_rendition_upshift_count` is 1

#### Scenario: A drop is reported

- **WHEN** playback moves from 1500000 to 500000
- **THEN** `video_source_bitrate_shift` is -1000000

#### Scenario: Only one rendition is ever selected

- **WHEN** a view plays to completion without a rendition change
- **THEN** both counters report 0

#### Scenario: Bitrates arrive as strings

- **WHEN** the player reports bitrates as the strings "1500000" and "500000"
- **AND** playback moves from the first to the second
- **THEN** `view_rendition_downshift_count` is 1

### Requirement: Time of the last rendition change is reported

The SDK SHALL report the wall-clock time of the most recent rendition change in
`view_last_rendition_changed_time`, as epoch milliseconds.

The first rendition selection of a view SHALL set this field, since the
rendition did change — from none to one.

#### Scenario: Several changes occur

- **WHEN** the rendition changes three times
- **THEN** `view_last_rendition_changed_time` reports the time of the third

### Requirement: The active rendition is described

While a rendition is selected the SDK SHALL report its width, height, frame
rate, video codec, audio codec and audio bitrate.

The SDK SHALL report a human-readable `video_source_rendition_name` derived from
the rendition's dimensions. The SDK SHALL NOT depend on the manifest declaring a
name, since many do not.

Where the manifest declares an audio bitrate the SDK SHALL report it; otherwise
the SDK SHALL report a measured value.

The rendition's attributes SHALL describe a single coherent rendition whenever
they are read together. An implementation writing them from separate callbacks
at different moments, such that one beacon may pair the bitrate of one rendition
with the resolution of another, is non-conformant.

#### Scenario: A 480-line rendition is active

- **WHEN** the active rendition is 854x480
- **THEN** `video_source_rendition_name` reports `480p`

#### Scenario: The manifest declares no audio bitrate

- **WHEN** the manifest omits an audio bitrate
- **THEN** `video_source_audio_bitrate` reports the measured audio bitrate

#### Scenario: Attributes are read together

- **WHEN** a beacon reports a bitrate and a resolution for the active rendition
- **THEN** both describe the same rendition

### Requirement: Delivery protocol is reported

The SDK SHALL report the streaming protocol in
`video_source_stream_protocol`, determined from the source URL.

#### Scenario: An HLS source

- **WHEN** the source URL ends in `.m3u8`
- **THEN** `video_source_stream_protocol` reports `HLS`

#### Scenario: A DASH source

- **WHEN** the source URL ends in `.mpd`
- **THEN** `video_source_stream_protocol` reports `DASH`

### Requirement: Buffer ahead of the playhead is reported

The SDK SHALL report the media buffered ahead of the current playhead position
in `video_source_buffer_length`, in milliseconds.

#### Scenario: Playback is comfortably buffered

- **WHEN** the playhead is at 10s and media is buffered to 25s
- **THEN** `video_source_buffer_length` reports approximately 15000

### Requirement: Dynamic range is reported where the manifest declares it

Where the manifest declares the dynamic range of a rendition, the SDK SHALL
report it in `video_source_dynamic_range_type` and latch it into
`view_initial_dynamic_range_type`.

Where the manifest carries no such declaration, the SDK SHALL leave both fields
absent rather than assume a default.

#### Scenario: The manifest declares standard dynamic range

- **WHEN** the active rendition declares SDR
- **THEN** `video_source_dynamic_range_type` reports `SDR`

#### Scenario: The manifest declares nothing

- **WHEN** the manifest carries no dynamic range declaration
- **THEN** `video_source_dynamic_range_type` is absent

### Requirement: A view's counters reset at a view boundary

Every view-scoped field SHALL be scoped to a single view. When a new video is
loaded within the same session, they SHALL reset.

Session-scoped and player-scoped values SHALL NOT reset at a view boundary.

#### Scenario: A second video is loaded

- **WHEN** a viewer finishes one video and loads another in the same session
- **THEN** the view counters restart from zero for the second video
- **AND** the player instance identifier is unchanged

### Requirement: Plays and events are counted

`view_played_count` SHALL count each time playback began, including resumes after
a pause.

`view_event_count` SHALL count the tracked events the view produced.

#### Scenario: A viewer pauses once and resumes

- **WHEN** playback starts, is paused, and is resumed
- **THEN** `view_played_count` reports 2

### Requirement: Paused time is measured and excluded from watch time

`view_paused_duration` SHALL report the total time the view spent paused,
whether the viewer paused an ad or the content.

`view_content_paused_duration` SHALL report the share of that total which fell
outside an ad break, so that pausing because an ad is playing is distinguishable
from pausing during the feature.

A pause SHALL be attributed by the ad state at the moment it began, not the
moment it ended. A pause started during an ad therefore remains ad time even
where the viewer resumes after the break has closed, since attributing by the
state at resume would credit that interval to content.

Time spent paused SHALL NOT be counted as watch time.

Both fields SHALL report zero for a view in which nobody paused, so that a view
with no pauses is distinguishable from one where the measurement was never
wired.

#### Scenario: A viewer pauses for a minute

- **WHEN** a viewer pauses for sixty seconds and resumes
- **THEN** `view_paused_duration` reports approximately 60000
- **AND** watch time excludes that minute

#### Scenario: A viewer pauses during an ad and during content

- **WHEN** a viewer pauses for 2 seconds during content, and for 15 seconds
  during an ad break
- **THEN** `view_paused_duration` reports approximately 17000
- **AND** `view_content_paused_duration` reports approximately 2000

#### Scenario: A pause straddles the end of an ad break

- **WHEN** a viewer pauses two seconds into an ad and resumes after the break
  has ended
- **THEN** that interval is excluded from `view_content_paused_duration`

#### Scenario: Nobody pauses

- **WHEN** a view completes without a single pause
- **THEN** both fields report 0 rather than being absent

### Requirement: The most recent stall is timestamped

`view_last_rebuffer_start_time` SHALL report when the most recent stall began, as
epoch milliseconds, and SHALL be absent for a view that never stalled.

#### Scenario: A view stalls twice

- **WHEN** playback stalls and later stalls again
- **THEN** `view_last_rebuffer_start_time` reports the time of the second

#### Scenario: A view never stalls

- **WHEN** playback completes without stalling
- **THEN** `view_last_rebuffer_start_time` is absent

### Requirement: Playback failure is distinguished from startup failure

`view_playback_failed` SHALL be set when playback failed at any point in the view.

`view_startup_business_exception` SHALL be set only when a business exception
occurred before playback presented its first frame, and
`view_playback_business_exception` only when one occurred after.

Exactly one of the two business exception flags SHALL be set for a given
exception. The classification SHALL be made when the exception is reported and
SHALL NOT be revised by what happens afterwards.

All three flags SHALL report false for a view in which nothing failed, so that a
clean view is distinguishable from one where the measurement was never wired.

#### Scenario: A business exception is reported before playback begins

- **WHEN** a business exception is reported before any frame has been presented
- **THEN** `view_startup_business_exception` reports true
- **AND** `view_playback_business_exception` reports false

#### Scenario: A business exception is reported during playback

- **WHEN** a business exception is reported after playback has begun
- **THEN** `view_playback_business_exception` reports true
- **AND** `view_startup_business_exception` reports false

#### Scenario: A view continues after an early exception

- **WHEN** a business exception is reported before playback and the viewer then
  watches for a minute
- **THEN** `view_startup_business_exception` still reports true

#### Scenario: Nothing fails

- **WHEN** a view completes without any failure or exception
- **THEN** all three flags report false rather than being absent

### Requirement: A view-level flag latches on

Once set, a view-level failure or exception flag SHALL remain set for the
remainder of the view, whatever happens afterwards.

This is deliberately unlike the corresponding player-level field, which describes
the most recent error only.

#### Scenario: A failure is followed by successful playback

- **WHEN** playback fails and then recovers and completes
- **THEN** `view_playback_failed` still reports true

### Requirement: An ad break is reported when it opens and when it closes

The SDK SHALL report that a break is in progress in `view_is_ad_playing`, and
that the view contained at least one break in `view_has_ad`.

`view_ad_break_count` SHALL count the breaks the view encountered, counting a
break containing several ads once.

A break SHALL be identified in `view_ad_break_id` by an identifier stable for the
life of that break.

Where a break opens and never closes — because the ads hung, or the viewer left
during it — the SDK SHALL settle the break when the view ends, so that its
counters and timings are reported rather than discarded.

#### Scenario: A break contains three ads

- **WHEN** a single break plays three advertisements in succession
- **THEN** `view_ad_break_count` reports 1

#### Scenario: A view ends inside an open break

- **WHEN** an advertisement hangs and the viewer leaves before the break closes
- **THEN** the break's counters and timings are still reported

### Requirement: Break position is classified against the content

`view_ad_break_position` SHALL report whether the break preceded the content,
interrupted it, or followed it.

A break with no content played before it SHALL be a preroll however the manifest
ordered it. A break with no content after it SHALL be a postroll.

#### Scenario: An ad leads the presentation

- **WHEN** a break plays before any content
- **THEN** `view_ad_break_position` reports preroll

#### Scenario: A break interrupts content

- **WHEN** a break plays after some content and further content follows
- **THEN** `view_ad_break_position` reports midroll

### Requirement: Time offset is measured on the content timeline

`view_ad_time_offset` SHALL report where a break sat in the content, measured as
content elapsed before it, and SHALL NOT report the break's position on a
presentation timeline that includes earlier ads.

The same break SHALL therefore report the same offset whether or not a preroll
preceded it.

#### Scenario: A midroll follows a preroll

- **WHEN** a fifteen second preroll is followed by sixty seconds of content and
  then a midroll break
- **THEN** `view_ad_time_offset` reports 60000

### Requirement: Break and ad durations are reported in milliseconds

`view_ad_duration` SHALL report the total declared duration of a break, and
`view_ad_asset_duration` the declared duration of an individual advertisement.

Both SHALL be reported in milliseconds, whatever unit the underlying player
reports, so that the same advertisement reports the same figure on every
implementation.

Where a duration is not yet known, the field SHALL be absent rather than reported
as zero.

#### Scenario: A five second advertisement

- **WHEN** an advertisement declaring five seconds plays
- **THEN** `view_ad_asset_duration` reports 5000

#### Scenario: A pod declares no duration in advance

- **WHEN** a break's duration is unknown when it opens
- **THEN** `view_ad_duration` is absent until it becomes known

### Requirement: Individual ads within a break are reported

The SDK SHALL report each advertisement's identity in `view_ad_asset_id`, its
position within the break in `view_ad_asset_index`, and the host serving its
media in `view_ad_asset_hostname`.

The host SHALL be resolved from the most specific address the manifest declares
for that advertisement. Where an advertisement declares no address of its own it
is served from the same host as the content, and the SDK SHALL report that host
rather than leaving the field absent.

#### Scenario: An ad is served from a dedicated host

- **WHEN** an advertisement declares its own media address on a separate host
- **THEN** `view_ad_asset_hostname` reports that host

#### Scenario: A stitched ad shares the content host

- **WHEN** an advertisement declares no address of its own
- **THEN** `view_ad_asset_hostname` reports the content's host

### Requirement: An impression means a frame was rendered

`view_ad_impression_count` SHALL count advertisements that actually rendered,
and SHALL NOT count an advertisement the player merely reached or requested.

`view_ad_attempt_count` SHALL count advertisements the player tried to play.

Where the player retries a failing advertisement, the SDK SHALL count one
attempt and one failure for that advertisement, not one of each per retry.

#### Scenario: An ad is requested and fails before rendering

- **WHEN** an advertisement is selected and fails before presenting a frame
- **THEN** `view_ad_attempt_count` includes it
- **AND** `view_ad_impression_count` does not

#### Scenario: The player retries a failing ad three times

- **WHEN** one advertisement fails and the player retries it twice more
- **THEN** `view_ad_attempt_count` reports 1 for that advertisement
- **AND** `view_ad_error_count` reports 1

### Requirement: Time spent in ads is measured separately from content

`view_ad_playing_time` SHALL be the time spent watching advertisements, accrued
only while the media is advancing. Time in which an advertisement is paused,
stalled for rebuffering, or seeking SHALL NOT accrue.

The SDK SHALL NOT measure a break from the moment it opened to the moment it
closed, since that includes the break's own buffering and any pause inside it,
and can report more advertisement played than the advertisement is long.

The SDK SHALL NOT credit time before the viewer began playback, so that a break
scheduled while the player was idle cannot inflate the figure.

Content playback time SHALL exclude time spent in ad breaks.

#### Scenario: An ad stalls while playing

- **WHEN** a 110 second break spans 125 seconds of wall clock, of which 15
  seconds was spent rebuffering
- **THEN** `view_ad_playing_time` reports approximately 110000
- **AND** does not exceed the declared duration of the ads in the break

#### Scenario: A viewer pauses during an ad

- **WHEN** a viewer pauses 2 seconds into a 30 second advertisement and resumes
  10 minutes later
- **THEN** the paused interval does not accrue to `view_ad_playing_time`

#### Scenario: A break is scheduled before playback begins

- **WHEN** a break is scheduled at manifest load and playback begins 15 seconds
  later
- **THEN** `view_ad_playing_time` counts only from when playback began

### Requirement: Preroll request and playback are reported separately

The SDK SHALL report `view_preroll_requested` as true when a preroll is known to
be scheduled, whether or not it plays, and `view_preroll_played` as true only
when it actually rendered.

`view_preroll_request_time` SHALL report when the preroll was requested, and
`view_preroll_load_time` how long it took to become ready.

`view_preroll_asset_hostname` and `view_preroll_tag_hostname` SHALL report the
host serving the preroll's media and the host that decided which advertisement
to serve. Where a mechanism performs no ad request, the tag host SHALL be absent.

Every preroll field SHALL be absent for a stream containing no preroll. Their
absence SHALL NOT be treated as a defect.

#### Scenario: A preroll is scheduled but fails

- **WHEN** a preroll is scheduled and fails before rendering
- **THEN** `view_preroll_requested` reports true
- **AND** `view_preroll_played` reports false

#### Scenario: A stream contains only a midroll

- **WHEN** a stream's only break is a midroll
- **THEN** every preroll field is absent

### Requirement: Ad failures are reported without ending the view

The SDK SHALL report ad errors in `view_ad_error_count`,
`view_ad_error_message` and `view_ad_error_source`, and SHALL count a break in
`view_ad_break_error_count` once if any error occurred inside it, however many
individual ads failed.

`view_ad_startup_error_count` SHALL count advertisements that failed before
playback could begin.

`view_ad_exit_before_start_count` SHALL count occasions where the viewer left
during a break in which nothing had yet rendered.

Where the failure carries a code, the SDK SHALL report it in
`view_ad_error_code`. Where an HTTP exchange lies behind the failure the SDK
SHALL prefer its response status, so that a missing creative, a rejected
credential and a failing ad server are distinguishable from one another rather
than collapsing into a single "download failed".

`view_ad_error_source` SHALL name what raised the error, since an error code has
no meaning without knowing whose numbering it belongs to.

The SDK SHALL NOT gate the counting of an ad failure on a severity flag supplied
by the player, since a player may mark every ad failure non-fatal by design.

An ad failure SHALL NOT be reported as a content playback failure, SHALL NOT set
either business exception flag, and SHALL NOT stop collection of content metrics
for the remainder of the view.

#### Scenario: Two ads fail in one break

- **WHEN** two advertisements inside a single break both fail
- **THEN** `view_ad_error_count` reports 2
- **AND** `view_ad_break_error_count` reports 1

#### Scenario: An ad fails and content continues

- **WHEN** an advertisement fails and content playback resumes afterwards
- **THEN** `view_playback_failed` is not set by that failure
- **AND** content metrics continue to be collected

#### Scenario: A creative is missing from the ad server

- **WHEN** an advertisement's media returns a not-found response
- **THEN** `view_ad_error_code` reports that status

#### Scenario: The player marks an ad failure non-fatal

- **WHEN** a player reports an ad failure with a non-fatal severity flag
- **THEN** the failure is still counted

### Requirement: Stalls during ads are attributed to ads

The SDK SHALL count rebuffering that occurs during an ad break in
`view_ad_rebuffer_count` and `view_ad_rebuffer_duration`, and SHALL NOT include
it in the content rebuffering metrics.

Seeking performed by the player to resume content after a break SHALL NOT be
reported as a viewer seek.

#### Scenario: The network stalls during an ad

- **WHEN** playback stalls twice while an advertisement is playing
- **THEN** `view_ad_rebuffer_count` reports 2
- **AND** the content rebuffer count is unchanged

#### Scenario: Content resumes after a break

- **WHEN** the player repositions the playhead to resume content after a break
- **THEN** the view's seek count is unchanged

### Requirement: Ad metadata not present in the manifest is integrator-supplied

`view_ad_id`, `view_ad_creative_id`, `view_ad_advertiser_name`,
`view_ad_click_url`, `view_ad_partner`, `view_ad_deal_id`,
`view_ad_skip_time_offset`, `view_ad_wrapper_id`,
`view_ad_wrapper_creative_ids`, `view_ad_wrapper_systems` and `view_ad_system`
SHALL be reported only where the application supplies them.

The SDK SHALL NOT derive these from a manifest, which carries no equivalent, and
SHALL attach a supplied value to the break open at the time it is supplied.

#### Scenario: No ad metadata is supplied

- **WHEN** a break plays and the application supplies no advertiser information
- **THEN** these fields are absent

### Requirement: Ad breaks are identified per insertion mechanism

Each implementation SHALL declare how it recognises an ad break and SHALL record
which requirements of this capability it satisfies.

Where a mechanism distinguishes ad media from content by an asset identifier,
the implementation SHALL determine the content identifier as the one accounting
for the greatest total duration, and SHALL NOT assume the content is whatever
appears first, since an ad may lead.

Where more than one scheme identifier is in use for the same descriptor, the
implementation SHALL accept every spelling in circulation. Matching only one
reports no ad breaks at all on streams carrying another, and does so silently,
which is indistinguishable from a stream having no ads.

Where a mechanism carries no signal distinguishing ads from content, the
implementation SHALL report no breaks rather than inferring them from durations
or address shapes.

An implementation SHALL NOT report an ad field it cannot source correctly. An
absent field is conformant; a substituted one is not.

#### Scenario: An ad leads the presentation

- **WHEN** the presentation begins with a 15 second ad asset followed by 600
  seconds of content
- **THEN** the content asset is identified as the 600 second one
- **AND** the leading asset is reported as a preroll break

#### Scenario: Content is split around a midroll

- **WHEN** content is presented as two parts of 300 seconds each, sharing one
  asset identifier, separated by a 15 second ad
- **THEN** the content asset is identified as the shared identifier
- **AND** exactly one break is reported

#### Scenario: A stream uses an alternative scheme identifier

- **WHEN** a stream carries its asset identifiers under a scheme identifier
  other than the one the implementation was first written against, but with
  identical meaning
- **THEN** ad breaks are still detected

#### Scenario: A manifest carries no ad signal

- **WHEN** a manifest distinguishes ads from content in no way the
  implementation recognises
- **THEN** no ad breaks are reported

### Requirement: Ad handling cannot destabilise playback

The SDK SHALL contain any error raised while interpreting ad information. A
manifest shape an implementation did not anticipate SHALL cost the ad fields and
nothing else.

#### Scenario: A malformed ad declaration is encountered

- **WHEN** a manifest carries an ad declaration the implementation cannot parse
- **THEN** the ad fields are absent
- **AND** playback and every other metric are unaffected

### Requirement: CMCD is read from what the player sent

The SDK SHALL report CMCD keys by reading the payload the player attached to its
media requests, and SHALL NOT compute a substitute from its own measurements.

Where the player attaches no CMCD payload, every CMCD field SHALL be absent.

#### Scenario: The player is not configured to send CMCD

- **WHEN** the player attaches no CMCD payload to its requests
- **THEN** all CMCD fields are absent

#### Scenario: The SDK measures a different throughput

- **WHEN** the player reports one throughput in CMCD and the SDK measures another
- **THEN** `request_cmcd_throughput` reports the player's value

### Requirement: Session-constant CMCD keys are reported

`request_cmcd_version`, `request_cmcd_stream_format`, `request_cmcd_stream_type`,
`request_cmcd_session_id` and `request_cmcd_content_id` SHALL be reported as the
player states them.

`request_cmcd_content_id` SHALL carry the identifier the application configured,
which is distinct from any identifier the SDK carries for the same content.

#### Scenario: An on-demand HLS stream

- **WHEN** the player reports an on-demand HLS stream
- **THEN** `request_cmcd_stream_format` and `request_cmcd_stream_type` report the
  player's codes for those

### Requirement: Per-request CMCD keys describe the object requested

`request_cmcd_object_type`, `request_cmcd_object_duration`,
`request_cmcd_bitrate`, `request_cmcd_max_bitrate`, `request_cmcd_buffer_length`,
`request_cmcd_throughput` and `request_cmcd_playback_rate` SHALL describe the
request most recently observed.

`request_cmcd_bitrate` SHALL be the encoded bitrate of the object requested, and
`request_cmcd_max_bitrate` the highest the player is willing to request.

#### Scenario: A video segment is requested

- **WHEN** the player requests a video segment from a rendition
- **THEN** `request_cmcd_object_type` reports the player's code for a video object
- **AND** `request_cmcd_bitrate` reports that rendition's encoded bitrate

### Requirement: Conditional CMCD keys are absent when the player omits them

`request_cmcd_startup`, `request_cmcd_buffer_starvation`, `request_cmcd_deadline`,
`request_cmcd_requested_throughput`, `request_cmcd_next_object` and
`request_cmcd_next_range` SHALL be reported only when the player includes them.

Their absence SHALL NOT be treated as a defect. A player includes them only in
the circumstances the CMCD specification describes, and a clean on-demand
playback may never produce several of them.

#### Scenario: Playback proceeds without stalling

- **WHEN** the buffer never empties during a view
- **THEN** `request_cmcd_buffer_starvation` is absent or reports false

#### Scenario: A byte range is not requested

- **WHEN** the player makes no byte-range request
- **THEN** `request_cmcd_next_range` is absent

### Requirement: CMCD reporting requires a readable transport

The SDK SHALL read CMCD from a transport it can observe. Where the player is
configured to send CMCD in a form the SDK cannot read, the fields SHALL be absent
rather than partially populated.

#### Scenario: CMCD is sent in a form the SDK cannot observe

- **WHEN** the player attaches CMCD in a transport the SDK cannot read
- **THEN** the CMCD fields are absent

### Requirement: Malformed CMCD does not affect other reporting

The SDK SHALL contain any error raised while parsing a CMCD payload. A payload it
cannot interpret SHALL leave the CMCD fields absent and SHALL NOT affect the
request metrics reported alongside them.

#### Scenario: A payload cannot be parsed

- **WHEN** a request carries a CMCD payload the SDK cannot interpret
- **THEN** the CMCD fields are absent for that request
- **AND** the request's timing and size metrics are still reported

### Requirement: Conformance is declared per implementation

Each implementation SHALL declare which requirements of this specification it
satisfies. A requirement an implementation cannot satisfy — because the
underlying player or delivery mechanism does not expose the information — SHALL
be recorded as unsupported rather than reported with a substituted or
approximate value.

An implementation SHALL NOT report a field it cannot source correctly. An absent
field is conformant; a wrong one is not.

An implementation whose rendition attributes are not guaranteed to describe a
single coherent rendition at the moment they are read SHALL record any field
derived from those attributes as unsupported.

#### Scenario: A player exposes no dynamic range information

- **WHEN** the player provides no dynamic range information for the active
  rendition
- **THEN** the implementation leaves `video_source_dynamic_range_type` absent
- **AND** records the requirement as unsupported

#### Scenario: A player exposes only a combined bitrate

- **WHEN** the player exposes a variant bitrate but no separate audio bitrate
- **THEN** the implementation reports `video_source_bitrate` from the variant
  bitrate
- **AND** leaves `video_source_audio_bitrate` absent

#### Scenario: A delivery mechanism performs no ad request

- **WHEN** advertisements are stitched into the manifest before it is written,
  so no ad request is made at playback time
- **THEN** the implementation leaves the ad request and tag fields absent
- **AND** records those requirements as unsupported

#### Scenario: An implementation writes rendition attributes out of step

- **WHEN** an implementation updates the bitrate and the resolution of the
  active rendition at different moments, so that a beacon may pair the bitrate
  of one rendition with the resolution of another
- **THEN** the implementation records the affected requirements as unsupported
  until the attributes are written coherently

### Requirement: An adapter composes with the core rather than replacing it

An implementation built on top of a shared core SHALL supply only the values it
can source better than the core can, and SHALL NOT suppress values the core
already derives.

Where an adapter provides its own reading of player state, that reading SHALL be
combined with the core's rather than substituted for it. An adapter that
substitutes silently removes every field it does not itself name, which presents
as those fields being unimplemented when they are merely unreachable.

An adapter SHALL NOT be required to restate a field the core derives from the
media element or the browser in order for that field to be reported.

#### Scenario: An adapter reports a subset of player state

- **WHEN** an adapter supplies its own player width and height but nothing about
  volume, mute or playback rate
- **THEN** the width and height come from the adapter
- **AND** volume, mute and playback rate are still reported from the core

#### Scenario: An adapter knows better than the media element

- **WHEN** a player wraps the media element and exposes a subtitle state its
  element does not reflect
- **THEN** the adapter's value is reported in preference to the core's

### Requirement: Each player integration declares its conformance

Every integration SHALL publish the set of requirements it does not satisfy,
with the reason for each. A reason SHALL identify what the player or delivery
mechanism does not expose, so that an absent field is not investigated as a
defect.

An integration SHALL revise its declaration when a requirement moves between
supported and unsupported, and SHALL NOT leave a field silently absent without a
corresponding entry.

#### Scenario: A field is absent and the reason is recorded

- **WHEN** an integration cannot source the dynamic range of a rendition
- **THEN** the field is absent
- **AND** the integration's declaration names that requirement and says why

#### Scenario: An integration gains an ability

- **WHEN** a player begins exposing information an integration previously could
  not source
- **THEN** the integration reports the field
- **AND** removes the corresponding entry from its declaration

### Requirement: Ad detection is declared per integration before it is relied upon

An integration reporting ad fields SHALL declare which insertion mechanism it
recognises, and SHALL report no breaks for any mechanism it does not.

An integration whose player presents a stitched advertisement as ordinary
content, with no signal distinguishing the two, SHALL record every ad
requirement as unsupported rather than inferring breaks from durations, address
shapes, or discontinuities.

Where an integration depends on an optional plugin to observe advertisements,
the declaration SHALL name that plugin. Ad support that exists only in the
presence of an unnamed dependency is not a declaration.

#### Scenario: A player flattens the structure that carries ad boundaries

- **WHEN** a player presents a multi-period presentation as a single timeline,
  discarding the descriptors that distinguish ad periods from content
- **THEN** the integration records the ad requirements as unsupported

#### Scenario: Ad observation depends on a plugin

- **WHEN** an integration can observe advertisements only when a particular
  plugin is present
- **THEN** its declaration names that plugin
- **AND** the ad fields are absent when the plugin is not in use

#### Scenario: An integration exposes its own ad interface

- **WHEN** a player provides its own advertisement interface covering both
  delivery mechanisms
- **THEN** the integration may satisfy the ad requirements through it
- **AND** declares that interface as the mechanism it recognises
