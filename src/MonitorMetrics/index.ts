import type { ActionableDataTypes } from "../DataType/index";

import {
  metricUpdation,
  getDomainName,
  getHostName,
  customTimerModule,
  ListenerManager,
  redactUrl,
  sanitizeErrorMessage,
} from "../CommonMethods/index";
import { buildUUID } from "../IdGenerationMethod/index";
import { BufferMonitor, BufferProcessor } from "./VideoBufferMonitor";
import { ErrorManager } from "./ErrorManager";
import { PlaybackEventHandler } from "./PlayerEventHandler";
import { PlaybackProgressMonitor } from "./PlaybackProgressMonitor";
import { PlayheadPositionHandler } from "./PlayheadPositionHandler";
import { PlaybackPulseHandler } from "./PlaybackPulseHandler";
import { RequestMetricsMonitor } from "./RequestMetricsMonitor";
import { VideoResolutionHandler } from "./VideoResolutionHandler";
import { VideoSeekTracker } from "./VideoSeekTracker";
import { PlaybackStartupMonitor } from "./PlaybackStartupMonitor";
import { WallClockTimeTracker } from "./WallClockTimeTracker";

const mapEvents = new Set([
  "viewBegin",
  "ended",
  "loadstart",
  "pause",
  "play",
  "playing",
  "waiting",
  "buffering",
  "buffered",
  "seeked",
  "error",
  "pulse",
  "requestCompleted",
  "requestFailed",
  "requestCanceled",
  // Ad events, as rows. Each carries the whole ad context (PlayerEventHandler
  // copies every view_ad_* key onto a row whose name starts with "ad") and the
  // cumulative ad counters as they stood when the row was built.
  "adbreakstart",
  "adplay",
  "adplaying",
  "adpause",
  "adended",
  "aderror",
  "adbreakend",
  "adskipped",
  // The ad decision request and its answer. Only breaks whose ads come from
  // an asset list (or an ad SDK) produce them; the gap between the two is the
  // ad server's latency, and a response naming zero ads is a no-fill.
  "adrequest",
  "adresponse",
  // Quartiles: playback progressed through 25, 50, 75 percent of one ad. Fired
  // once per attempt, from ad SDK callbacks where a wrapper has them and from
  // the ad's own playhead on the hls.js and dash.js paths.
  "adfirstquartile",
  "admidpoint",
  "adthirdquartile",
]);

// Quartile thresholds as fractions of the ad's duration, with the event each
// one raises. Completion is adended and is not a quartile.
const AD_QUARTILES: Array<[number, string]> = [
  [0.25, "adfirstquartile"],
  [0.5, "admidpoint"],
  [0.75, "adthirdquartile"],
];

// A quartile means the viewer played through the threshold, not that the
// playhead landed past it. Two consecutive progress reports further apart than
// this, in seconds of ad time, are a seek: nothing fires for thresholds inside
// the gap. hls.js and dash.js report progress every 250 ms or so, and 2x
// playback rate still stays well under this.
const AD_PROGRESS_SEEK_GAP = 1.5;
// An ad whose last position report was further than this from its duration
// when it ended did not reach its end: a playout-limit cut or an engine quirk,
// reported as outcome "unknown". Wider than one tick, so a slow report rate
// (a background tab) cannot turn a real completion into a cut.
const AD_CUT_SHORT_MARGIN = 1.5;

// When an ad plays to its end the browser raises pause on its own, just before
// ended, and that can arrive before the engine announces the ad is over. A
// pause with this little of the ad left, in seconds, is the ad finishing and
// not the viewer pausing.
const AD_END_PAUSE_MARGIN = 0.5;

// Names whose payloads may carry ad URLs or ad server error text. Both are
// redacted before they are merged into view data, so nothing downstream ever
// sees a signed token.
const isAdEventName = (name: string): boolean =>
  name.startsWith("ad") || name.startsWith("preroll");

const AD_URL_KEYS = [
  "view_ad_asset_url",
  "view_ad_tag_url",
  "view_ad_click_url",
];

const sanitizeAdPayload = (payload: any): any => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const clean: any = { ...payload };

  AD_URL_KEYS.forEach((key) => {
    if (clean[key] !== undefined) {
      clean[key] = redactUrl(clean[key]);
    }
  });

  if (clean.view_ad_error_message !== undefined) {
    clean.view_ad_error_message = sanitizeErrorMessage(
      clean.view_ad_error_message,
    );
  }

  return clean;
};

// Per-asset keys. Cleared when a break opens and when it closes, so a row
// outside any ad, or the next break's adbreakstart, never carries the previous
// ad's identity.
const AD_ASSET_KEYS = [
  "view_ad_asset_id",
  "view_ad_outcome",
  "view_ad_asset_index",
  "view_ad_asset_duration",
  "view_ad_asset_url",
  "view_ad_asset_hostname",
  "view_ad_id",
  "view_ad_creative_id",
  "view_ad_advertiser_name",
  "view_ad_click_url",
  "view_ad_skip_time_offset",
  "view_ad_error_source",
  "view_ad_error_code",
  "view_ad_error_message",
  "view_ad_error_fatal",
];

// The break watchdog is progress based. A break is abandoned when nothing ad
// related has happened for this long - no asset started, ended, or errored, no
// frame rendered, no playhead movement - which a paused ad or a backgrounded
// app does not trip as long as the player keeps reporting. A hard ceiling on
// top guards against a break that keeps producing events but never closes.
const AD_BREAK_IDLE_TIMEOUT = 3e4;
const AD_BREAK_MAX_DURATION = 12e4;

const adBreakHardTimeout = (declaredMs: any): number =>
  declaredMs > 0
    ? Math.max(declaredMs * 4, AD_BREAK_MAX_DURATION)
    : AD_BREAK_MAX_DURATION;

// What the media element raises on its own account while an ad plays through
// it. Inside an open break these describe the ad, which already has its own
// rows (adplay, adplaying, adpause, adended), so as rows they only read as the
// content starting, stalling, pausing, or finishing in the middle of an ad.
// They are still dispatched and still drive everything internal - watch time,
// the impression, adpause, stall detection - but they are not sent and not
// counted. After adbreakend they are rows again: that play and playing are the
// content resuming.
const HIDDEN_IN_AD_BREAK = new Set([
  "play",
  "playing",
  "waiting",
  "pause",
  "ended",
  // Scrubbing a paused ad's own bar raised one seeked per drag step - 22 in
  // one run. The seek tracker already ignores seeks inside a break; the rows
  // go with them.
  "seeked",
]);

// Playback events that count towards view_event_count. Pulses and per segment
// request events are deliberately left out - a heartbeat every ten seconds and
// one event per segment would swamp the handful of events a viewer actually
// causes, which is what this number is meant to describe.
const countedEvents = new Set([
  "loadstart",
  "play",
  "playing",
  "pause",
  "waiting",
  "buffering",
  "buffered",
  "seeked",
  "ended",
  "error",
]);

function initializeResolutionState(instance: {
  resolutionState: {
    prev_source_width: any;
    prev_source_bitrate: any;
    video_source_resolution_dropped_count: number;
  };
  data: {
    video_source_width: any;
    video_source_bitrate: any;
    video_source_resolution_dropped_count: number;
    view_rendition_upshift_count?: number;
    view_rendition_downshift_count?: number;
  };
}) {
  if (!instance.resolutionState) {
    instance.resolutionState = {
      prev_source_width: instance.data.video_source_width ?? 0,
      prev_source_bitrate: instance.data.video_source_bitrate ?? 0,
      video_source_resolution_dropped_count: 0,
    };
    instance.data.video_source_resolution_dropped_count = 0;
    // Seeded so a view where nothing shifted is distinguishable from one where
    // the counters were never populated. Written only on increment, both states
    // would otherwise arrive absent and read the same downstream.
    instance.data.view_rendition_upshift_count = 0;
    instance.data.view_rendition_downshift_count = 0;
  }
}

// Records the rendition playback actually began on. Written once per view, and
// only once a real bitrate has arrived, so an empty first switch is skipped.
function captureInitialRendition(instance: { data: Record<string, any> }) {
  const data = instance.data;
  // Named rather than inlined as a negated comparison. video_source_bitrate is
  // undefined until a rendition is selected, and `bitrate <= 0` would read that
  // as a usable value where `!(bitrate > 0)` correctly rejects it.
  const hasUsableBitrate = data.video_source_bitrate > 0;

  if (data.view_initial_bitrate !== undefined || !hasUsableBitrate) {
    return;
  }

  // Parsed the same way validateData normalises video_source_bitrate, since
  // this runs before that pass and players report bandwidth as a string
  data.view_initial_bitrate = Number.parseInt(data.video_source_bitrate, 10);
  data.view_initial_fps = data.video_source_fps;
  data.view_initial_source_height = data.video_source_height;
  data.view_initial_source_width = data.video_source_width;
  data.view_initial_source_codec = data.video_source_codec;
  data.view_initial_audio_codec = data.video_source_audio_codec;
  data.view_initial_dynamic_range_type = data.video_source_dynamic_range_type;
}

// Counts bitrate switches in each direction and records how large each one was.
// The first rendition selection is skipped, since moving from no bitrate to the
// starting one is not a shift.
//
// Both figures are parsed before use. Players report bandwidth as a string and
// this runs ahead of validateData, so comparing the raw values would sort them
// lexicographically - reading a drop from 1500000 to 500000 as an increase.
function updateRenditionShiftState(instance: {
  resolutionState: { prev_source_bitrate: number };
  data: Record<string, any>;
}) {
  const previousBitrate =
    Number.parseInt(instance.resolutionState?.prev_source_bitrate as any, 10) ||
    0;
  const currentBitrate =
    Number.parseInt(instance.data.video_source_bitrate, 10) || 0;

  // Safe as a comparison rather than a negation: parseInt(...) || 0 always
  // yields a finite number, so there is no undefined or NaN to mishandle.
  if (currentBitrate <= 0) {
    return;
  }

  if (previousBitrate > 0) {
    const bitrateShift = currentBitrate - previousBitrate;

    if (bitrateShift !== 0) {
      instance.data.video_source_bitrate_shift = bitrateShift;
      metricUpdation(
        instance.data,
        bitrateShift > 0
          ? "view_rendition_upshift_count"
          : "view_rendition_downshift_count",
        1,
      );
    }
  }
  instance.resolutionState.prev_source_bitrate = currentBitrate;
}

function updateResolutionState(instance: {
  resolutionState: { prev_source_width: number };
  data: {
    video_source_width: number;
    video_source_resolution_dropped_count: number;
  };
}) {
  if (
    instance.resolutionState.prev_source_width >
    instance.data.video_source_width
  ) {
    instance.resolutionState.prev_source_width =
      instance.data.video_source_width;
    instance.data.video_source_resolution_dropped_count++;
  } else {
    instance.resolutionState.prev_source_width =
      instance.data.video_source_width;
  }
}

function nucleusState(
  this: any,
  self: any,
  token: string,
  actionableData: ActionableDataTypes,
): any {
  const eventEmitter = new ListenerManager();
  this.NavigationStart = customTimerModule.getNavigationStartTime();
  this.fp = self;
  this.id = token;
  const defaultConfig = {
    debug: actionableData?.debug ?? false,
    beaconDomain: actionableData.configDomain ?? "anlytix.io",
    disableCookies: actionableData.disableCookies ?? false,
    respectDoNotTrack: actionableData.respectDoNotTrack ?? false,
    allowRebufferTracking: false,
    disablePlayheadRebufferTracking:
      actionableData.disablePlayheadRebufferTracking ?? false,
    errorConverter: function (errAttr: any) {
      return errAttr;
    },
  };
  actionableData = {
    ...defaultConfig,
    actionableData,
  };
  this.userConfigData = actionableData;
  this.fetchPlayheadTime = actionableData.actionableData.fetchPlayheadTime;
  // The element's own clock, read by the stall detector. Optional.
  this.fetchMediaTime = actionableData.actionableData.fetchMediaTime;
  this.fetchAdBreakOpen = actionableData.actionableData.fetchAdBreakOpen;
  this.fetchStateData =
    actionableData.actionableData.fetchStateData ??
    function () {
      return {};
    };
  this.allowRebufferTracking = actionableData.allowRebufferTracking;
  this.disablePlayheadRebufferTracking =
    actionableData.disablePlayheadRebufferTracking;
  this.errorConverter = actionableData.errorConverter;
  this.eventsDispatcher = new PlaybackEventHandler(
    self,
    actionableData.actionableData.data.workspace_id,
    actionableData,
    this,
  );
  this.data = {
    player_instance_id: buildUUID(),
    beacon_domain:
      actionableData.beaconCollectionDomain ?? actionableData.beaconDomain,
  };
  this.data.view_sequence_number = 1;
  this.data.player_sequence_number = 1;
  this.lastCheckedEventTime = void 0;
  this.throbTimeoutId = undefined;
  this.adBreakActive = false;
  // True only while the adbreakend row is being built, so that one row reports
  // view_is_ad_playing false while adBreakActive stays set for the trailing
  // window the other trackers rely on.
  this.adBreakClosing = false;
  this.adBreakIdleTimer = undefined;
  this.adBreakHardTimer = undefined;
  this.adBreakHadImpression = false;
  this.adFailedAssets = undefined;
  this.adRenderedAssets = undefined;
  this.adStartedAssets = undefined;
  this.adErrorAttemptAssets = undefined;
  this.adCurrentAssetId = undefined;
  // The ad the viewer skipped, until its trailing adended has been dropped
  this.adSkippedAssetId = undefined;
  // Attempts that ended with their own terminal row (adended or adskipped).
  // Anything attempted and not here when the break settles is settled from
  // the way the break closed. Reset with the other per-break sets.
  this.adTerminalAssets = undefined;
  // Why the break is closing, when something other than the engine's normal
  // end says so: the watchdog, a skip, the playout limit. Read at settlement.
  this.adBreakCloseReason = undefined;
  // Ads hls.js says the break's playout limit will cut: their adended is a
  // cut, not a completion.
  this.adPlayoutLimitAssets = undefined;
  // The viewer seeked after the current ad last made progress. An attempt
  // still open at settlement with this set was cancelled, not timed out.
  this.adSeekSinceProgress = false;
  // Ads each asset list said it held, by break id - the response arrives
  // before the break opens. 0 with no attempts is a no-fill.
  this.adResponseCounts = undefined;
  // The view is ending because the page moved to another video, so an open
  // ad is cancelled rather than abandoned
  this.viewEndingForSourceChange = false;
  this.adPendingImpression = false;
  // The current ad has been announced by adplay and has not yet ended, failed,
  // or been skipped. Together with adAssetRendered this is what makes a pause
  // an adpause rather than the pause the browser fires between assets.
  this.adAssetStarted = false;
  this.adAssetRendered = false;
  this.adAssetPaused = false;
  // Quartile state for the current attempt: which thresholds already fired,
  // and the last progress fraction seen, so a jump can be told from playback.
  this.adQuartilesFired = undefined;
  this.adLastProgress = undefined;
  // Seconds of the current ad still to play, as of the last progress report.
  // Only meaningful while adLastProgress is set; the two are written together.
  this.adLastRemaining = undefined;
  // Whether this view has had an ad position report. Set by the first one and
  // kept for the view: from then on view_ad_playing_time comes from position
  // movement and the wall clock leaves it alone.
  this.adTimeFromProgress = false;
  this.prerollStartedAt = undefined;
  // Whether this view has already reported a loadstart. Reset per view.
  this.loadstartSent = false;
  // A waiting row has been sent and playback has not moved on since
  this.waitingReported = false;

  // True for an element event raised inside an open ad break. The trailing
  // window after adbreakend does not count: the break is over by then.
  const hiddenByAdBreak = (name: string): boolean =>
    HIDDEN_IN_AD_BREAK.has(name) &&
    this.adBreakActive === true &&
    this.adBreakClosing !== true;

  this.dispatch = (name: string, eventData: ActionableDataTypes) => {
    if (isAdEventName(name)) {
      eventData = sanitizeAdPayload(eventData);
    }

    const currentTime = Date.now();

    if (
      this.lastCheckedEventTime &&
      currentTime - this.lastCheckedEventTime > 36e5
    ) {
      if (actionableData?.debug) {
        console.warn(
          "After an hour of no user activity, a new view is generated upon the occurrence of an event.",
        );
      }

      const configViewData = {
        viewer_timestamp: this.fp.utilityMethods.now(),
      };
      Object.assign(this.data, configViewData);
      eventEmitter.emit("configureView", configViewData);
      this.lastCheckedEventTime = currentTime;
    }

    // One loadstart per view. The browser raises it every time the element is
    // given a new source, and hls.js plays interstitials by swapping the
    // element between the content and each ad, so a view with four ads raised
    // eight. Nothing reads the later ones; they only read as the video
    // reloading and inflate view_event_count. Checked after the inactivity
    // rollover above, so the first loadstart of the new view is kept.
    if (name === "loadstart") {
      if (this.loadstartSent) {
        return;
      }
      this.loadstartSent = true;
    }

    // A skipped ad still ends. hls.js has no skip event: skip() raises the
    // same asset-ended event as an ad that played out, and a wrapper may
    // forward its engine's ended callback after its skipped one. The adskipped
    // row is the terminal one, so the adended for that same ad is dropped
    // whole - no row, no completion, no end credit to ad playing time.
    if (name === "adended" && this.adSkippedAssetId !== undefined) {
      const endedAssetId =
        (eventData as any)?.view_ad_asset_id ??
        this.adCurrentAssetId ??
        "break";
      if (endedAssetId === this.adSkippedAssetId) {
        this.adSkippedAssetId = undefined;
        return;
      }
    }

    // One waiting per wait. The browser can raise it more than once before
    // playback moves on - when hls.js swaps the element from an ad back to the
    // content it fires once as the old source goes and again before the new
    // one has a frame, milliseconds apart. Nothing internal reads waiting, so
    // the repeats are dropped whole. A waiting hidden inside an ad break is
    // not a row and does not arm this.
    if (name === "waiting" && !hiddenByAdBreak(name)) {
      if (this.waitingReported) {
        return;
      }
      this.waitingReported = true;
    } else if (
      name === "playing" ||
      name === "pause" ||
      name === "seeking" ||
      name === "ended"
    ) {
      this.waitingReported = false;
    }

    if (name === "play") {
      if (this.data.view_start === void 0) {
        const viewBeginData = {
          view_start: this.fp.utilityMethods.now(),
        };
        Object.assign(this.data, viewBeginData);
        eventEmitter.emit("viewBegin", viewBeginData);
        this.lastCheckedEventTime = currentTime;
      }
    }

    if (mapEvents.has(name)) {
      this.appendVideoState();
    }

    // Counted before the emit so the beacon this event triggers includes it
    if (countedEvents.has(name) && !hiddenByAdBreak(name)) {
      metricUpdation(this.data, "view_event_count", 1);
    }

    const eventPayload = {
      viewer_timestamp: this.fp.utilityMethods.now(),
      ...eventData,
    };

    // adprogress carries a raw position and duration for the quartile check;
    // neither is a view field, so it is not merged into view data.
    if (
      name !== "videoChange" &&
      name !== "programChange" &&
      name !== "adprogress" &&
      name !== "adplayoutlimit"
    ) {
      Object.assign(this.data, eventPayload);
    }
    eventEmitter.emit(name, eventPayload);
    this.lastCheckedEventTime = currentTime;
  };

  this.playerDestroyed = void 0;
  this.initiatePulse = void 0;
  const destroyerFunction = () => {
    this.demolishView();
  };

  if (window?.addEventListener !== undefined) {
    window.addEventListener(
      "pagehide",
      (event) => {
        if (!event.persisted) {
          destroyerFunction();
        }
      },
      false,
    );
    window.addEventListener("beforeunload", () => {
      destroyerFunction();
    });
  }

  eventEmitter.on("destroy", () => {
    destroyerFunction();
  });

  const onViewChange = (viewchange: ActionableDataTypes) => {
    this.viewEndingForSourceChange = true;
    this.dispatch("viewCompleted");
    this.viewEndingForSourceChange = false;
    this.filterData("viewCompleted");
    this.dispatch("configureView", viewchange);
    Object.assign(this.data, viewchange);
  };

  eventEmitter.on("videoChange", (newdata: ActionableDataTypes) => {
    onViewChange(newdata);
  });

  eventEmitter.on("programChange", (newdata: ActionableDataTypes) => {
    const onProgramChange = { ...newdata };
    onViewChange(onProgramChange);
    this.dispatch("play");
    this.dispatch("playing");
  });

  // Time spent paused, accumulated between a pause and the resume that follows
  eventEmitter.on("pause", (pauseData: any) => {
    if (this.pausedAt === undefined) {
      this.pausedAt =
        pauseData?.viewer_timestamp ?? this.fp.utilityMethods.now();
      // Latched here rather than read at resume: a viewer who pauses inside a
      // preroll and comes back after it has ended would otherwise have that
      // time credited to content, because the break is closed by then.
      this.pausedDuringAd = this.adBreakActive === true;
    }

    // adpause: a pause while an ad that has rendered is still in progress. The
    // guards keep out the pause the browser fires when an asset ends and the
    // next one is attached, which is the player, not the viewer. That pause can
    // land before the engine's own "ad ended", while the ad still counts as in
    // progress, so the ad's remaining time is checked as well.
    const adPlayedOut =
      this.adLastProgress !== undefined &&
      this.adLastRemaining !== undefined &&
      this.adLastRemaining <= AD_END_PAUSE_MARGIN;

    if (
      this.adBreakActive &&
      this.adAssetStarted &&
      this.adAssetRendered &&
      !this.adAssetPaused &&
      !adPlayedOut
    ) {
      this.adAssetPaused = true;
      touchAdBreak();
      this.dispatch("adpause", {});
    }
  });

  const resolvePause = (resumeData: any) => {
    if (this.pausedAt === undefined) {
      return;
    }

    const resumedAt =
      resumeData?.viewer_timestamp ?? this.fp.utilityMethods.now();
    const pausedFor = Math.max(0, resumedAt - this.pausedAt);
    metricUpdation(this.data, "view_paused_duration", pausedFor);

    if (!this.pausedDuringAd) {
      metricUpdation(this.data, "view_content_paused_duration", pausedFor);
    }

    this.pausedAt = undefined;
    this.pausedDuringAd = false;
  };

  eventEmitter.on("play", (playData: any) => {
    resolvePause(playData);
    // Not inside an ad break: hls.js makes the element raise play every time
    // it attaches an ad, and the viewer resuming a paused ad raises one too.
    // Neither is the video being played, and neither is a play row.
    if (!hiddenByAdBreak("play")) {
      metricUpdation(this.data, "view_played_count", 1);
    }

    // hls.js opens a preroll break at manifest parse, which under click-to-play
    // can be long before the viewer presses play. The preroll wait starts at
    // the later of the two, otherwise the idle time on the poster is reported
    // as ad load time.
    if (this.prerollStartedAt !== undefined && !this.adBreakHadImpression) {
      this.prerollStartedAt = Math.max(
        this.prerollStartedAt,
        playData?.viewer_timestamp ?? this.fp.utilityMethods.now(),
      );
    }
  });

  eventEmitter.on("playing", (playingData: any) => resolvePause(playingData));

  eventEmitter.on("configureView", () => {
    this.resolutionState = undefined;
    this.pausedAt = undefined;
    this.pausedDuringAd = false;
    // A new view starts its first stretch from zero, so a carried over counter
    // would credit the previous video's time to this one's first rendition.
    this.renditionPlayingTime = 0;
    delete this.data.video_source_playing_time;
    // Safety net: a stuck flag would silently kill content metrics for the
    // rest of the view. Clearing at view boundary bounds the blast radius.
    this.adBreakActive = false;
    this.adBreakClosing = false;
    this.adBreakHadImpression = false;
    this.adFailedAssets = undefined;
    this.adRenderedAssets = undefined;
    this.adStartedAssets = undefined;
    this.adErrorAttemptAssets = undefined;
    this.adCurrentAssetId = undefined;
    this.adSkippedAssetId = undefined;
    this.adTerminalAssets = undefined;
    this.adBreakCloseReason = undefined;
    this.adPlayoutLimitAssets = undefined;
    this.adSeekSinceProgress = false;
    this.adResponseCounts = undefined;
    delete this.data.view_ad_break_end_reason;
    this.adPendingImpression = false;
    this.adAssetStarted = false;
    this.adAssetRendered = false;
    this.adAssetPaused = false;
    this.adQuartilesFired = undefined;
    this.adLastProgress = undefined;
    this.adTimeFromProgress = false;
    this.prerollStartedAt = undefined;
    // A new view reports its own loadstart
    this.loadstartSent = false;
    this.waitingReported = false;
    if (this.adBreakClearTimer !== undefined) {
      clearTimeout(this.adBreakClearTimer);
      this.adBreakClearTimer = undefined;
    }
    clearAdWatchdogs();
    this.refreshViewData();
    this.refreshVideoData();
    this.appendVideoState();
    Object.assign(this.data, actionableData.actionableData.data);
    this.initializeView();
  });

  // Everything a closing break must record, wherever it closes from. The
  // watchdog used to drop a hung break without looking at adBreakHadError, so a
  // break that errored and then hung - the worst thing that can happen to a
  // viewer - reported no errored break at all. Sharing one settlement is what
  // stops the two paths drifting.
  // `viewEnded` is settlement on viewCompleted rather than adbreakend: the
  // open attempts were abandoned (or cancelled by a source change) and the
  // reason goes on that row instead.
  const settleAdBreak = (viewEnded = false) => {
    // Ads that errored and never went on to render. Anything that recovered has
    // already been removed, so a break whose ads all stalled and then played is
    // not reported as having failed.
    const failedCount = this.adFailedAssets?.size ?? 0;

    // Attempts with neither a terminal row nor a failure: the break closed on
    // them. Which bucket depends only on how it closed.
    let openCount = 0;
    const attempted = new Set<string>([
      ...(this.adStartedAssets ?? []),
      ...(this.adErrorAttemptAssets ?? []),
    ]);
    attempted.forEach((assetKey) => {
      if (
        !this.adTerminalAssets?.has(assetKey) &&
        !this.adFailedAssets?.has(assetKey)
      ) {
        openCount++;
      }
    });

    let openOutcome: string | undefined;
    if (openCount > 0) {
      if (viewEnded) {
        openOutcome = this.viewEndingForSourceChange ? "canceled" : "abandoned";
      } else if (this.adBreakCloseReason === "timed_out") {
        openOutcome = "timed_out";
      } else if (this.adSeekSinceProgress) {
        openOutcome = "canceled";
      } else {
        openOutcome = "unknown";
      }
      metricUpdation(this.data, `view_ad_${openOutcome}_count`, openCount);
    }

    // Why the break closed. Not whether its ads succeeded: a break that ran
    // its schedule with one failed ad is "completed" with break_error_count 1.
    const breakId = this.data.view_ad_break_id;
    const responseCount =
      breakId !== undefined ? this.adResponseCounts?.get(breakId) : undefined;
    let reason: string;
    if (viewEnded) {
      reason = this.viewEndingForSourceChange ? "canceled" : "view_ended";
    } else if (this.adBreakCloseReason !== undefined) {
      reason = this.adBreakCloseReason;
    } else if (
      failedCount > 0 &&
      !this.adBreakHadImpression &&
      (this.adTerminalAssets?.size ?? 0) === 0
    ) {
      // Nothing in the break ever reached the screen or an end: the break
      // could not run (an asset list that never loaded, a lone ad that 404s)
      reason = "failed";
    } else if (attempted.size === 0 && responseCount === 0) {
      reason = "no_fill";
    } else if (openOutcome === "canceled") {
      reason = "canceled";
    } else {
      reason = "completed";
    }
    this.data.view_ad_break_end_reason = reason;

    if (failedCount > 0) {
      metricUpdation(this.data, "view_ad_error_count", failedCount);
      // Counted once however many assets inside it failed
      metricUpdation(this.data, "view_ad_break_error_count", 1);

      // Per attempt, not per break: a failed ad that never put a frame on
      // screen is a startup failure even when another ad in the same pod
      // played. The viewer sat in front of a dead pause for that one.
      let startupFailures = 0;
      this.adFailedAssets?.forEach((assetKey: string) => {
        if (!this.adRenderedAssets?.has(assetKey)) {
          startupFailures++;
        }
      });
      if (startupFailures > 0) {
        metricUpdation(
          this.data,
          "view_ad_startup_error_count",
          startupFailures,
        );
      }
    }
    this.adFailedAssets = undefined;
    this.adRenderedAssets = undefined;
    this.adStartedAssets = undefined;
    this.adErrorAttemptAssets = undefined;
    this.adTerminalAssets = undefined;
    this.adBreakCloseReason = undefined;
    this.adSeekSinceProgress = false;
    // view_ad_playing_time is not credited here. It accrues from the ad's own
    // position reports (adprogress), or for integrations without them from the
    // wall clock while an ad is rendered and not paused, so it stops on its own
    // whenever the ad stalls or the viewer pauses.
  };

  const clearAdWatchdogs = () => {
    if (this.adBreakIdleTimer !== undefined) {
      clearTimeout(this.adBreakIdleTimer);
      this.adBreakIdleTimer = undefined;
    }
    if (this.adBreakHardTimer !== undefined) {
      clearTimeout(this.adBreakHardTimer);
      this.adBreakHardTimer = undefined;
    }
  };

  // Nothing guarantees a break ever closes. A fatal ad error, a seek out of the
  // break, or the stream ending mid-ad all leave PRIMARY_RESUMED unsent, and
  // with the flag stuck on, content metrics are misattributed for the rest of
  // the view. The watchdog closes the break itself by dispatching adbreakend,
  // so the row exists and settlement runs through the ordinary listener.
  const closeHungAdBreak = () => {
    clearAdWatchdogs();

    if (!this.adBreakActive) {
      return;
    }

    this.adBreakCloseReason = "timed_out";
    this.dispatch("adbreakend", {});
  };

  // The idle timer. Thirty seconds without a signal is not proof the break is
  // over: a paused ad sends nothing, and an ad trickling in on a slow network
  // can sit inside hls.js's 120 s fragment timeout with nothing reaching the
  // SDK while hls.js is still very much in the break. Closing then turned the
  // rest of the ad into content rows and a later skip into a second
  // adbreakend. So the timer defers to the pause state and to the engine
  // where it can be asked, and re-arms; the hard cap below stays unconditional.
  const fireAdWatchdog = () => {
    if (!this.adBreakActive) {
      clearAdWatchdogs();
      return;
    }

    const engineStillInBreak = this.fetchAdBreakOpen?.() === true;
    if (this.adAssetPaused || engineStillInBreak) {
      this.adBreakIdleTimer = setTimeout(fireAdWatchdog, AD_BREAK_IDLE_TIMEOUT);
      return;
    }

    closeHungAdBreak();
  };

  // Every observed ad activity restarts the idle clock. Called from the ad
  // listeners and from timeupdate while a break is open.
  const touchAdBreak = () => {
    if (!this.adBreakActive) {
      return;
    }
    if (this.adBreakIdleTimer !== undefined) {
      clearTimeout(this.adBreakIdleTimer);
    }
    this.adBreakIdleTimer = setTimeout(fireAdWatchdog, AD_BREAK_IDLE_TIMEOUT);
  };

  const clearAdAssetKeys = () => {
    AD_ASSET_KEYS.forEach((key) => {
      delete this.data[key];
    });
  };

  eventEmitter.on("adbreakstart", (adData: any) => {
    // Cancel any pending clear from a previous break's trailing window so it
    // cannot flip the flag off mid-new-break.
    if (this.adBreakClearTimer !== undefined) {
      clearTimeout(this.adBreakClearTimer);
      this.adBreakClearTimer = undefined;
    }
    clearAdWatchdogs();
    this.adBreakHardTimer = setTimeout(
      closeHungAdBreak,
      adBreakHardTimeout(adData?.view_ad_duration),
    );
    // hls.js opens a preroll break as soon as it parses the manifest, which can
    // be long before the viewer presses play. Nothing accrues from that idle
    // wait now, because ad time only advances on playback slices, so the flag
    // can simply be set and left.
    this.adBreakActive = true;
    this.adBreakClosing = false;
    touchAdBreak();
    // Reset per break, so a break is judged only on what happened inside it
    this.adBreakHadImpression = false;
    this.adFailedAssets = undefined;
    this.adRenderedAssets = undefined;
    this.adStartedAssets = undefined;
    this.adErrorAttemptAssets = undefined;
    this.adCurrentAssetId = undefined;
    this.adSkippedAssetId = undefined;
    this.adTerminalAssets = undefined;
    this.adBreakCloseReason = undefined;
    this.adPlayoutLimitAssets = undefined;
    this.adSeekSinceProgress = false;
    delete this.data.view_ad_break_end_reason;
    this.adPendingImpression = false;
    this.adAssetStarted = false;
    this.adAssetRendered = false;
    this.adAssetPaused = false;
    this.adQuartilesFired = undefined;
    this.adLastProgress = undefined;
    // The previous break's asset is not this break's; the adbreakstart row must
    // not carry it
    clearAdAssetKeys();

    if (adData?.view_ad_break_position === "preroll") {
      this.prerollStartedAt = this.fp.utilityMethods.now();
      if (
        adData?.view_ad_asset_hostname &&
        this.data.view_preroll_asset_hostname === undefined
      ) {
        this.data.view_preroll_asset_hostname = adData.view_ad_asset_hostname;
      }
    }
    this.data.view_has_ad = true;
    metricUpdation(this.data, "view_ad_break_count", 1);
  });

  eventEmitter.on("adbreakend", () => {
    // A watchdog or a late engine event can both try to close the same break;
    // the second one finds nothing open and must not settle twice
    if (!this.adBreakActive || this.adBreakClosing) {
      return;
    }

    settleAdBreak();
    clearAdWatchdogs();
    // The adbreakend row itself reports the flag off: the break is over as
    // far as the backend is concerned. adBreakActive stays set for the trailing
    // window below so late element events are still attributed to the ad.
    this.adBreakClosing = true;
    this.adAssetStarted = false;
    this.adAssetRendered = false;
    this.adAssetPaused = false;
    this.adQuartilesFired = undefined;
    this.adLastProgress = undefined;
    // An ad that never rendered must not be credited with the content's own
    // playing event when playback resumes inside the trailing window below.
    // Left set, a failed last ad in a break counted an impression on resume.
    this.adPendingImpression = false;
    // Break summary only on this row; the asset that ended is already described
    // by its own adended or aderror
    clearAdAssetKeys();
    // Delay the flag clear so trailing native <video> events (seeking, seeked,
    // playing) that fire after PRIMARY_RESUMED still land inside the
    // suppression window. Guarded by cancellation in adBreakStarted /
    // configureView so a pending timer can never leak across boundaries.
    if (this.adBreakClearTimer !== undefined) {
      clearTimeout(this.adBreakClearTimer);
    }
    this.adBreakClearTimer = setTimeout(() => {
      this.adBreakActive = false;
      this.adBreakClosing = false;
      this.adBreakClearTimer = undefined;
    }, 500);
  });

  // An ad the player selected and attached. It has not rendered anything yet
  // and might never - so this is the attempt, and it is what every ad error
  // rate is measured against.
  eventEmitter.on("adplay", (playData: any) => {
    touchAdBreak();
    this.adPendingImpression = true;
    this.adAssetStarted = true;
    this.adAssetRendered = false;
    this.adAssetPaused = false;
    // A new attempt starts its quartiles from nothing, whether it is the next
    // ad in the pod or a retry of the same one
    this.adQuartilesFired = new Set();
    this.adLastProgress = undefined;
    // Names the ad an error belongs to, since hls.js does not always carry the
    // asset on the error payload. Falls back exactly as the error handler does,
    // so a break that identifies neither still resolves both sides to one key
    // and an impression can clear the entry its own error made.
    this.adCurrentAssetId =
      playData?.view_ad_asset_id ?? playData?.view_ad_break_id ?? "break";
    // A new ad starting means the skipped one's adended has come or never
    // will; without this a wrapper that sends no asset ids would have the
    // next ad's adended dropped too.
    this.adSkippedAssetId = undefined;
    // Per-attempt state. The outcome belongs to the attempt that ended, not
    // to this one; a skip or playout cut reported before this adplay ended the
    // previous ad, not the break.
    delete this.data.view_ad_outcome;
    this.adSeekSinceProgress = false;
    if (
      this.adBreakCloseReason !== "timed_out" &&
      this.adBreakCloseReason !== "playout_limit"
    ) {
      this.adBreakCloseReason = undefined;
    }

    // One attempt per ad. hls.js preloads the next ad in a pod, and when that
    // load fails and is retried the error arrives before this event does; the
    // error path has then already recorded the attempt, and counting it here
    // as well reported more attempts than there were ads.
    this.adStartedAssets = this.adStartedAssets ?? new Set();
    this.adStartedAssets.add(this.adCurrentAssetId);

    if (this.adErrorAttemptAssets?.has(this.adCurrentAssetId)) {
      this.adErrorAttemptAssets.delete(this.adCurrentAssetId);
    } else {
      metricUpdation(this.data, "view_ad_attempt_count", 1);
    }
  });

  // The impression. A playing raised while a break is open is the ad itself
  // reaching the screen, which is the only honest signal that a frame rendered
  // - hls.js announces the asset long before that, and an ad left paused on its
  // first frame never gets here at all.
  const recordAdImpression = () => {
    // The trailing window after adbreakend keeps adBreakActive set for the
    // other trackers; a playing in that window is content resuming, not an ad.
    if (!this.adBreakActive || this.adBreakClosing) {
      return;
    }

    touchAdBreak();

    // Not the first frame: the ad resumed after an adpause. Reported as a
    // second adplaying for the same ad, with no change to the impression count.
    if (!this.adPendingImpression) {
      if (this.adAssetPaused && this.adAssetStarted) {
        this.adAssetPaused = false;
        this.dispatch("adplaying", {});
      }
      return;
    }

    this.adPendingImpression = false;
    this.adAssetRendered = true;
    this.adAssetPaused = false;

    // Read before the flag is set - the first impression of a preroll break is
    // the frame the viewer was waiting for, and the gap since the break opened
    // is how long they stared at nothing.
    if (this.prerollStartedAt !== undefined && !this.adBreakHadImpression) {
      this.data.view_preroll_played = true;
      this.data.view_preroll_load_time = Math.max(
        0,
        this.fp.utilityMethods.now() - this.prerollStartedAt,
      );
      this.prerollStartedAt = undefined;
    }

    // This ad rendered, so whatever it raised on the way was recovered from and
    // is not a failure. Remembered so a later error on the same ad is a
    // playback failure, not a startup one.
    this.adFailedAssets?.delete(this.adCurrentAssetId);
    this.adRenderedAssets = this.adRenderedAssets ?? new Set();
    this.adRenderedAssets.add(this.adCurrentAssetId);

    this.adBreakHadImpression = true;
    metricUpdation(this.data, "view_ad_impression_count", 1);
    // Through dispatch, not the raw emitter: that is what gives the row its
    // sequence number, timestamp, and place in the beacon queue.
    this.dispatch("adplaying", {});
  };

  eventEmitter.on("playing", recordAdImpression);

  // Playhead movement inside a break is ad progress; it keeps the idle
  // watchdog from firing on a long but healthy pod.
  eventEmitter.on("timeupdate", () => {
    if (this.adBreakActive && !this.adBreakClosing) {
      touchAdBreak();
    }
  });

  // Players whose ads render outside the content element - Shaka's client-side
  // IMA overlays a second video - never raise playing for the ad, so playback
  // of the ad has to be announced explicitly instead. Sharing the handler keeps
  // one definition of what an impression is, and the guard above means an
  // integration that signals both ways still counts exactly one.
  eventEmitter.on("adimpression", recordAdImpression);

  // Announced by the manifest before playback reaches it, so this is set even
  // for a preroll that never fills. It is the denominator that makes
  // view_preroll_played a fill rate rather than a bare count.
  eventEmitter.on("prerollScheduled", () => {
    this.data.view_preroll_requested = true;
  });

  eventEmitter.on("prerollRequested", (payload: any) => {
    if (this.data.view_preroll_request_time === undefined) {
      this.data.view_preroll_request_time = this.fp.utilityMethods.now();
    }
    metricUpdation(this.data, "view_preroll_request_count", 1);
    const tagUrl = payload?.view_ad_tag_url;
    if (tagUrl && this.data.view_preroll_tag_hostname === undefined) {
      this.data.view_preroll_tag_hostname = getHostName(tagUrl);
    }
  });

  // An ad that started and also ended played through; one without a matching
  // adended was cut short. Counted here as well as carried on the events, so a
  // view that ends mid break still reports its totals.
  eventEmitter.on("adended", (endData: any) => {
    touchAdBreak();
    // An ad that played to its end did not fail, whatever it raised on the
    // way: errors after its first frame are retried loads like the ones before
    // it. hls.js does not raise this for an ad it dropped on a fatal error, so
    // a real failure keeps its entry and is still counted at settlement.
    this.adFailedAssets?.delete(
      endData?.view_ad_asset_id ?? this.adCurrentAssetId,
    );
    // The ad ends up to one tick after its last position report. When that
    // report was within the end margin the ad played out, and the remainder
    // is playing time; a larger remainder is an ad cut short, not credited.
    if (
      this.adTimeFromProgress &&
      this.adLastProgress !== undefined &&
      this.adLastRemaining !== undefined &&
      this.adLastRemaining > 0 &&
      this.adLastRemaining <= AD_END_PAUSE_MARGIN
    ) {
      metricUpdation(
        this.data,
        "view_ad_playing_time",
        Math.round(1e3 * this.adLastRemaining),
      );
    }
    // Completed only if the ad reached its end. hls.js raises the same
    // asset-ended event when the break's playout limit cuts an ad, and the
    // position then stops well short of the duration; either signal makes
    // this an "unknown" end - never a skip, nothing said the viewer did it.
    const endedAssetId = endData?.view_ad_asset_id ?? this.adCurrentAssetId;
    const cutShort =
      this.adPlayoutLimitAssets?.has(endedAssetId ?? "break") === true ||
      (this.adTimeFromProgress &&
        this.adLastProgress !== undefined &&
        this.adLastRemaining !== undefined &&
        this.adLastRemaining > AD_CUT_SHORT_MARGIN);
    this.adTerminalAssets = this.adTerminalAssets ?? new Set();
    this.adTerminalAssets.add(endedAssetId ?? "break");
    if (cutShort) {
      this.data.view_ad_outcome = "unknown";
      metricUpdation(this.data, "view_ad_unknown_count", 1);
    } else {
      this.data.view_ad_outcome = "completed";
      metricUpdation(this.data, "view_ad_complete_count", 1);
    }
    this.adAssetStarted = false;
    this.adAssetRendered = false;
    this.adAssetPaused = false;
    this.adQuartilesFired = undefined;
    this.adLastProgress = undefined;
  });

  // A skip from a player or ad SDK that raises one explicitly; hls.js never
  // does. Terminal for the ad, and deliberately not a completion.
  eventEmitter.on("adskipped", (skipData: any) => {
    touchAdBreak();
    // The ad the viewer skipped; its trailing adended is dropped in dispatch.
    // Not a failure either, whatever it raised before the skip.
    this.adSkippedAssetId =
      skipData?.view_ad_asset_id ?? this.adCurrentAssetId ?? "break";
    this.adFailedAssets?.delete(this.adSkippedAssetId);
    this.adTerminalAssets = this.adTerminalAssets ?? new Set();
    this.adTerminalAssets.add(this.adSkippedAssetId);
    this.data.view_ad_outcome = "skipped";
    metricUpdation(this.data, "view_ad_skip_count", 1);
    // hls.js skips the whole break; a wrapper skipping one ad of a pod clears
    // this on the next adplay
    this.adBreakCloseReason = "skipped";
    this.adAssetStarted = false;
    this.adAssetRendered = false;
    this.adAssetPaused = false;
    this.adQuartilesFired = undefined;
    this.adLastProgress = undefined;
  });

  // One row per threshold per attempt, whoever reports it. A wrapper with
  // native quartile callbacks and the engine's own progress check can both
  // land here for the same ad; the set makes the second one a no-op.
  const recordAdQuartile = (name: string) => {
    if (!this.adBreakActive || this.adBreakClosing || !this.adAssetStarted) {
      return false;
    }
    this.adQuartilesFired = this.adQuartilesFired ?? new Set();
    if (this.adQuartilesFired.has(name)) {
      return false;
    }
    this.adQuartilesFired.add(name);
    touchAdBreak();
    return true;
  };

  // Wrapper path: an ad SDK's quartile callback, dispatched by name. The row
  // is already on its way through dispatch; this only records it so an engine
  // report of the same threshold is suppressed. Must run before the generic
  // beacon listener, which registration order guarantees.
  AD_QUARTILES.forEach(([, name]) => {
    eventEmitter.on(name, () => {
      recordAdQuartile(name);
    });
  });

  // Engine path: the stream monitors report the ad's own position and
  // duration in seconds on every tick. A threshold fires only when playback
  // moved through it - the previous report was below, this one is at or
  // above, and the two are close enough together to be playback rather than a
  // seek. A pause or stall reports the same position twice and fires nothing;
  // a seek past two thresholds fires neither, and later ones still fire if the
  // viewer plays on through them.
  eventEmitter.on("adprogress", (progress: any) => {
    const position = progress?.position;
    const duration = progress?.duration;

    if (
      !this.adBreakActive ||
      this.adBreakClosing ||
      !this.adAssetStarted ||
      typeof position !== "number" ||
      typeof duration !== "number" ||
      !Number.isFinite(position) ||
      !(duration > 0)
    ) {
      return;
    }

    const fraction = Math.min(1, Math.max(0, position / duration));
    const previous = this.adLastProgress;
    this.adLastProgress = fraction;
    this.adLastRemaining = duration - position;
    this.adTimeFromProgress = true;

    // Ad playing time is the ad's own position moving, the same way
    // view_content_playback_time is the content playhead moving. A stall, a
    // pause or the wait for the first frame reports the same position twice
    // and adds nothing. The first report of an ad is measured from zero, where
    // an asset player starts; a first position further out than a tick is a
    // resume into the middle of the ad and is not credited. Once a view has
    // reported progress this is the only source; the wall clock in
    // WallClockTimeTracker is the fallback for integrations that never report
    // an ad position.
    const advancedSeconds =
      previous === undefined ? position : (fraction - previous) * duration;
    if (advancedSeconds <= 0 || advancedSeconds > AD_PROGRESS_SEEK_GAP) {
      return;
    }

    metricUpdation(
      this.data,
      "view_ad_playing_time",
      Math.round(1e3 * advancedSeconds),
    );
    this.adSeekSinceProgress = false;

    if (previous === undefined) {
      return;
    }

    AD_QUARTILES.forEach(([threshold, name]) => {
      if (previous < threshold && fraction >= threshold) {
        if (recordAdQuartile(name)) {
          this.dispatch(name, {});
        }
      }
    });
  });

  eventEmitter.on("adrequest", () => {
    touchAdBreak();
    metricUpdation(this.data, "view_ad_request_count", 1);
  });

  eventEmitter.on("adresponse", (responseData: any) => {
    touchAdBreak();
    const count = responseData?.view_ad_response_count;
    const breakId = responseData?.view_ad_break_id;
    if (typeof count === "number" && breakId !== undefined) {
      this.adResponseCounts = this.adResponseCounts ?? new Map();
      this.adResponseCounts.set(breakId, count);
    }
  });

  // hls.js: the break's X-PLAYOUT-LIMIT will cut this ad. Its adended is then
  // a cut, not a completion. Keyed by asset because it can arrive while the
  // ad's adplay is still held before the viewer's first play.
  eventEmitter.on("adplayoutlimit", (limitData: any) => {
    touchAdBreak();
    this.adPlayoutLimitAssets = this.adPlayoutLimitAssets ?? new Set();
    this.adPlayoutLimitAssets.add(
      limitData?.view_ad_asset_id ?? this.adCurrentAssetId ?? "break",
    );
    this.adBreakCloseReason = "playout_limit";
  });

  // A seek while an ad is open. If the break then closes with that ad still
  // open and no progress since, the viewer seeked out of it.
  eventEmitter.on("seeking", () => {
    if (this.adBreakActive && !this.adBreakClosing && this.adAssetStarted) {
      this.adSeekSinceProgress = true;
    }
  });

  // Which ads in the open break have raised an error and not since recovered.
  // hls.js retries a failing load and raises an error every time, so counting
  // events reported four failures for a pod whose three ads all played through.
  // Its fatal flag cannot separate them either - it is forced false on every
  // interstitial asset error, including a manifest returning 422 that can never
  // load. What actually distinguishes the two is whether the ad went on to
  // render, so entries are keyed by asset and an impression removes one. The
  // totals are taken when the break settles, once that is known.
  eventEmitter.on("aderror", (errorData: any) => {
    touchAdBreak();
    const assetKey =
      errorData?.view_ad_asset_id ??
      this.adCurrentAssetId ??
      errorData?.view_ad_break_id ??
      "break";

    this.adFailedAssets = this.adFailedAssets ?? new Set();
    this.adFailedAssets.add(assetKey);

    // An ad that failed before it was ever selected was never counted by
    // adplay, so the attempt is recorded here instead, once. An ad adplay has
    // announced is already counted, at any point in its life - an error after
    // its first frame used to count a second attempt. If adplay does follow
    // for this ad, it finds the entry and does not count again.
    const alreadyCounted =
      this.adStartedAssets?.has(assetKey) ||
      this.adErrorAttemptAssets?.has(assetKey);

    if (!alreadyCounted) {
      this.adErrorAttemptAssets = this.adErrorAttemptAssets ?? new Set();
      this.adErrorAttemptAssets.add(assetKey);
      metricUpdation(this.data, "view_ad_attempt_count", 1);
    }
  });

  // Only knowable when the view ends: a break was still open and no ad had
  // played, so the viewer left during the wait rather than during an ad. A
  // break that closes normally without filling is a different thing and is not
  // counted here.
  eventEmitter.on("viewCompleted", () => {
    // The stretch in progress when the view ends. Without this the last
    // rendition of every view reports nothing, and a view with no rendition
    // change at all reports nothing whatsoever.
    reportRenditionStretch();

    // adBreakActive stays true for 500ms after a break closes so trailing media
    // events land inside the suppression window. A pending clear timer means the
    // break already ended - the viewer did not leave during it, and it has
    // already been settled.
    const breakStillOpen =
      this.adBreakActive && this.adBreakClearTimer === undefined;

    if (breakStillOpen && !this.adBreakHadImpression) {
      metricUpdation(this.data, "view_ad_exit_before_start_count", 1);
    }

    // A view ending inside an open break is still a break that happened. Without
    // this its ad time and its failures are discarded, and the worst sessions -
    // an ad that hung until the viewer left - report nothing at all.
    if (breakStillOpen) {
      settleAdBreak(true);
      this.adBreakActive = false;
      this.adBreakClosing = false;
      clearAdWatchdogs();
    }
  });

  this.warning = new ErrorManager(this, eventEmitter);
  this.gripper = new VideoSeekTracker(this, eventEmitter);
  this.throughput = new RequestMetricsMonitor(this, eventEmitter);
  this.playheadHandler = new PlayheadPositionHandler(this, eventEmitter);
  this.handlePulse = new PlaybackPulseHandler(this, eventEmitter);
  this.handleScaling = new VideoResolutionHandler(this, eventEmitter);
  this.trackTimer = new WallClockTimeTracker(this, eventEmitter);
  this.playbackManager = new PlaybackProgressMonitor(this, eventEmitter);
  this.eventWaiting = new BufferMonitor(this, eventEmitter);
  this.loaderProps = new BufferProcessor(this, eventEmitter);
  this.metricCommencement = new PlaybackStartupMonitor(this, eventEmitter);

  // The stretch of playing time that ends with this rendition change. Written
  // before the beacon is built and cleared after, so it appears on the change
  // beacon and on no other. The rendition attributes alongside it describe the
  // rendition starting, not the one measured - a consumer reading an ordered
  // event list attributes each stretch to the entry before it.
  const reportRenditionStretch = () => {
    if ((this.renditionPlayingTime ?? 0) > 0) {
      this.data.video_source_playing_time = this.renditionPlayingTime;
    }
  };

  const clearRenditionStretch = () => {
    this.renditionPlayingTime = 0;
    delete this.data.video_source_playing_time;
  };

  // Event listener for 'variantChanged'
  eventEmitter.on("variantChanged", (variantData: any) => {
    reportRenditionStretch();
    this.data.view_last_rendition_changed_time =
      variantData?.viewer_timestamp ?? this.fp.utilityMethods.now();
    initializeResolutionState(this);

    if (this.data.video_source_width) {
      updateResolutionState(this);
    }
    updateRenditionShiftState(this);
    captureInitialRendition(this);
    this.appendVideoState();
    this.validateData();
    this.filterData("variantChanged");
    clearRenditionStretch();
  });

  eventEmitter.on("playerReady", () => {
    const currentTime = this.fp.utilityMethods.now();

    if (this.data.player_init_time) {
      const startupTime = currentTime - this.data.player_init_time;
      this.data.player_startup_time = Math.max(0, startupTime);
    }

    if (this.NavigationStart) {
      if (
        this.data.player_init_time ??
        customTimerModule.getDomContentLoadedEnd()
      ) {
        const pageLoadTime =
          Math.min(
            this.data.player_init_time ?? 1 / 0,
            customTimerModule.getDomContentLoadedEnd() ?? 1 / 0,
          ) - this.NavigationStart;
        this.data.page_load_time = Math.max(0, pageLoadTime);
      }
    }
    this.appendVideoState();
    this.validateData();
    this.filterData("playerReady");
  });

  mapEvents.forEach((key) => {
    eventEmitter.on(key, () => {
      if (hiddenByAdBreak(key)) {
        return;
      }

      this.appendVideoState();
      this.validateData();
      this.filterData(key);
    });
  });

  this.dispatch("configureView");
}

nucleusState.prototype.demolishView = function () {
  if (!this.playerDestroyed) {
    this.playerDestroyed = true;

    if (void 0 !== this.data.view_start) {
      this.dispatch("viewCompleted");
      this.filterData("viewCompleted");
      this.eventsDispatcher.destroy();
    }
  }
};

nucleusState.prototype.initializeView = function () {
  this.data.view_id = buildUUID();
  // Seeded so a view that failed in none of these ways is distinguishable from
  // one where the field was never wired. Each is written only when it becomes
  // true, so without this both states arrive absent and read identically. They
  // cost two keys on the view boundary events; delta encoding suppresses them
  // everywhere else.
  this.data.view_playback_failed = false;
  this.data.view_playback_business_exception = false;
  this.data.view_startup_business_exception = false;
  // Seeded for the same reason: a view where nobody paused must report zero,
  // not absence. Absent reads downstream as "the field was never wired".
  this.data.view_paused_duration = 0;
  this.data.view_content_paused_duration = 0;
  metricUpdation(this.data, "player_view_count", 1);
};

nucleusState.prototype.appendVideoState = function () {
  Object.assign(this.data, this.fetchStateData());
  // Stamped here rather than in fetchStateData, which is built in tracker()
  // before nucleusState exists and so cannot see the flag. Means "the player is
  // in ad mode", including loading, buffering, and pauses inside the break; it
  // is not evidence that a frame rendered. Off on the adbreakend row itself.
  this.data.view_is_ad_playing =
    this.adBreakActive === true && this.adBreakClosing !== true;
  this.playheadHandler.handleCurrentPosition(this);
  this.validateData();
};

nucleusState.prototype.validateData = function () {
  const numericalKeys = [
    "player_width",
    "player_height",
    "video_source_width",
    "video_source_height",
    "video_source_bitrate",
  ];
  const urlKeys = ["player_source_url", "video_source_url"];
  numericalKeys.forEach(
    (key) =>
      (this.data[key] = Number.parseInt(this.data[key], 10) ?? undefined),
  );
  urlKeys.forEach((paramName) => {
    const excludes = (this.data[paramName] ?? "").toLowerCase();

    if (excludes.startsWith("data:") || excludes.startsWith("blob:")) {
      this.data[paramName] = "MSE style URL";
    }
  });
};

nucleusState.prototype.filterData = function (str: string) {
  if (this.data.view_id) {
    if (
      this.data.player_source_duration > 0 ||
      this.data.video_source_duration > 0
    ) {
      this.data.video_source_is_live = false;
    } else if (this.data.video_source_duration === void 0) {
      this.data.video_source_is_live = true;
    }

    const videoSourceUrl =
      this.data.video_source_url ?? this.data.player_source_url;

    if (videoSourceUrl) {
      this.data.video_source_domain = getDomainName(videoSourceUrl);
      this.data.video_source_hostname = getHostName(videoSourceUrl);
    }

    const updatedata = { ...this.data };
    this.eventsDispatcher.sendData(str, updatedata);
    this.data.view_sequence_number++;
    this.data.player_sequence_number++;

    this.handlePulseEvent(this);

    if (str === "viewCompleted") {
      delete this.data.view_id;
    }
  }
};

nucleusState.prototype.handlePulseEvent = (instance: any) => {
  if (instance.throbTimeoutId) {
    clearTimeout(instance.throbTimeoutId);
  }

  if (!instance.warning.hasErrorOccurred) {
    instance.throbTimeoutId = setTimeout(() => {
      if (!instance.data.player_is_paused) {
        instance.dispatch("pulse");
      }
    }, 10000);
  }
};

nucleusState.prototype.refreshViewData = function () {
  Object.keys(this.data).forEach((k) => {
    if (0 === k.indexOf("view_")) {
      delete this.data[k];
    }
  });
  this.data.view_sequence_number = 1;
};

nucleusState.prototype.refreshVideoData = function () {
  Object.keys(this.data).forEach((k) => {
    if (0 === k.indexOf("video_")) {
      delete this.data[k];
    }
  });
};

export { nucleusState };
