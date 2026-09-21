import type { ActionableDataTypes } from "../DataType/index";

import {
  metricUpdation,
  getDomainName,
  getHostName,
  customTimerModule,
  ListenerManager,
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
]);

// Ceiling on how long ad suppression may stay armed without the break closing.
// Generous enough for a long pod plus its buffering, short enough that a stuck
// flag costs one break rather than the whole view.
const AD_BREAK_MAX_DURATION = 12e4;

// Sized from what the manifest declared, with room for the ad's own loading and
// buffering on top - twice the break plus thirty seconds. Falls back to the flat
// ceiling when a break opens without a usable duration, which an X-ASSET-LIST pod
// always does. Takes milliseconds, as view_ad_duration reports.
const adBreakTimeout = (declaredMs: any): number =>
  declaredMs > 0
    ? Math.min(declaredMs * 2 + 3e4, AD_BREAK_MAX_DURATION)
    : AD_BREAK_MAX_DURATION;

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
  this.adBreakWatchdog = undefined;
  this.adBreakHadImpression = false;
  this.adFailedAssets = undefined;
  this.adCurrentAssetId = undefined;
  this.adPendingImpression = false;
  this.adAssetInFlight = false;
  this.prerollStartedAt = undefined;

  this.dispatch = (name: string, eventData: ActionableDataTypes) => {
    // Ad events are deliberately absent from mapEvents until the collector
    // accepts the names, so they never become beacons. Uncomment to observe
    // them during ad tracking work - one place rather than a log per handler.
    // if (actionableData?.debug && /^(ad|preroll)/.test(name)) {
    //   console.log("[fp-ad] " + name, eventData);
    // }

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
    if (countedEvents.has(name)) {
      metricUpdation(this.data, "view_event_count", 1);
    }

    const eventPayload = {
      viewer_timestamp: this.fp.utilityMethods.now(),
      ...eventData,
    };

    if (name !== "videoChange" && name !== "programChange") {
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
    this.dispatch("viewCompleted");
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
    metricUpdation(this.data, "view_played_count", 1);
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
    this.adBreakHadImpression = false;
    this.adFailedAssets = undefined;
    this.adCurrentAssetId = undefined;
    this.adPendingImpression = false;
    this.adAssetInFlight = false;
    this.prerollStartedAt = undefined;
    if (this.adBreakClearTimer !== undefined) {
      clearTimeout(this.adBreakClearTimer);
      this.adBreakClearTimer = undefined;
    }
    if (this.adBreakWatchdog !== undefined) {
      clearTimeout(this.adBreakWatchdog);
      this.adBreakWatchdog = undefined;
    }
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
  const settleAdBreak = () => {
    // Ads that errored and never went on to render. Anything that recovered has
    // already been removed, so a break whose ads all stalled and then played is
    // not reported as having failed.
    const failedCount = this.adFailedAssets?.size ?? 0;

    if (failedCount > 0) {
      metricUpdation(this.data, "view_ad_error_count", failedCount);
      // Counted once however many assets inside it failed
      metricUpdation(this.data, "view_ad_break_error_count", 1);

      // Nothing rendered in this break at all, so the viewer sat in front of a
      // dead pause rather than watching a broken ad
      if (!this.adBreakHadImpression) {
        metricUpdation(this.data, "view_ad_startup_error_count", failedCount);
      }
    }
    this.adFailedAssets = undefined;
    // view_ad_playing_time is not credited here. It accrues in
    // WallClockTimeTracker from the same playback slices as view_watch_time, so
    // it stops on its own whenever the ad stalls or the viewer pauses.
  };

  eventEmitter.on("adbreakstart", (adData: any) => {
    // Cancel any pending clear from a previous break's trailing window so it
    // cannot flip the flag off mid-new-break.
    if (this.adBreakClearTimer !== undefined) {
      clearTimeout(this.adBreakClearTimer);
      this.adBreakClearTimer = undefined;
    }
    // Nothing guarantees the break ever closes. A fatal ad error, a seek out of
    // the break, or the stream ending mid-ad all leave PRIMARY_RESUMED unsent,
    // and with the flag stuck on, play/pause/waiting/buffered are dropped for
    // the rest of the view - taking watch time and rebuffering with them. This
    // caps the damage at one break rather than one view. Losing the ad/content
    // split is always preferable to losing the underlying metric.
    if (this.adBreakWatchdog !== undefined) {
      clearTimeout(this.adBreakWatchdog);
    }
    this.adBreakWatchdog = setTimeout(() => {
      this.adBreakWatchdog = undefined;

      if (!this.adBreakActive) {
        return;
      }

      settleAdBreak();
      this.adBreakActive = false;
    }, adBreakTimeout(adData?.view_ad_duration));
    // hls.js opens a preroll break as soon as it parses the manifest, which can
    // be long before the viewer presses play. Nothing accrues from that idle
    // wait now, because ad time only advances on playback slices, so the flag
    // can simply be set and left.
    this.adBreakActive = true;
    // Reset per break, so a break is judged only on what happened inside it
    this.adBreakHadImpression = false;
    this.adFailedAssets = undefined;
    this.adCurrentAssetId = undefined;
    this.adPendingImpression = false;
    this.adAssetInFlight = false;

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
    settleAdBreak();
    // Delay the flag clear so trailing native <video> events (seeking, seeked,
    // playing) that fire after PRIMARY_RESUMED still land inside the
    // suppression window. Guarded by cancellation in adBreakStarted /
    // configureView so a pending timer can never leak across boundaries.
    if (this.adBreakWatchdog !== undefined) {
      clearTimeout(this.adBreakWatchdog);
      this.adBreakWatchdog = undefined;
    }
    if (this.adBreakClearTimer !== undefined) {
      clearTimeout(this.adBreakClearTimer);
    }
    this.adBreakClearTimer = setTimeout(() => {
      this.adBreakActive = false;
      this.adBreakClearTimer = undefined;
    }, 500);
  });

  // An ad the player selected and attached. It has not rendered anything yet
  // and might never - so this is the attempt, and it is what every ad error
  // rate is measured against.
  eventEmitter.on("adplay", (playData: any) => {
    this.adPendingImpression = true;
    // Marks this ad as already counted, so an error raised against it does not
    // record a second attempt
    this.adAssetInFlight = true;
    // Names the ad an error belongs to, since hls.js does not always carry the
    // asset on the error payload. Falls back exactly as the error handler does,
    // so a break that identifies neither still resolves both sides to one key
    // and an impression can clear the entry its own error made.
    this.adCurrentAssetId =
      playData?.view_ad_asset_id ?? playData?.view_ad_break_id ?? "break";
    metricUpdation(this.data, "view_ad_attempt_count", 1);
  });

  // The impression. A playing raised while a break is open is the ad itself
  // reaching the screen, which is the only honest signal that a frame rendered
  // - hls.js announces the asset long before that, and an ad left paused on its
  // first frame never gets here at all.
  const recordAdImpression = () => {
    if (!this.adBreakActive || !this.adPendingImpression) {
      return;
    }

    this.adPendingImpression = false;
    this.adAssetInFlight = false;

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
    // is not a failure
    this.adFailedAssets?.delete(this.adCurrentAssetId);

    this.adBreakHadImpression = true;
    metricUpdation(this.data, "view_ad_impression_count", 1);
    eventEmitter.emit("adplaying", {});
  };

  eventEmitter.on("playing", recordAdImpression);

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
  eventEmitter.on("adended", () => {
    this.adAssetInFlight = false;
    metricUpdation(this.data, "view_ad_complete_count", 1);
  });

  eventEmitter.on("adrequest", () => {
    metricUpdation(this.data, "view_ad_request_count", 1);
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
    const assetKey =
      errorData?.view_ad_asset_id ??
      this.adCurrentAssetId ??
      errorData?.view_ad_break_id ??
      "break";

    this.adFailedAssets = this.adFailedAssets ?? new Set();
    const alreadyFailed = this.adFailedAssets.has(assetKey);
    this.adFailedAssets.add(assetKey);

    // An ad that failed before it was ever selected was never counted by
    // adplay, so the attempt is recorded here instead. One already in flight
    // has been counted, and so has one that already errored - either way,
    // adding it again inflated attempts past the number of ads that existed.
    if (!this.adAssetInFlight && !alreadyFailed) {
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
      settleAdBreak();
      this.adBreakActive = false;
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
  // before nucleusState exists and so cannot see the flag.
  this.data.view_is_ad_playing = this.adBreakActive === true;
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
