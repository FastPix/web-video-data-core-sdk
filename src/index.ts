import "./types/global";
import {
  getDomainName,
  getHostName,
  analyzeVideo,
  identifyElement,
  checkDoNotTrack,
  identifyStreamingProtocol,
  utilityMethods,
} from "./CommonMethods/index";
import { EventMetaData } from "./DataType/index";
import { nucleusState } from "./MonitorMetrics/index";
import { setupHlsMonitoring } from "./StreamMonitoring/HlsMonitoring";
import { setupDashMonitoring } from "./StreamMonitoring/DashMonitoring";

const contextState: Record<string, string> = {};
const html5VideoEvents: string[] = [
  "loadstart",
  "pause",
  "play",
  "playing",
  "seeking",
  "seeked",
  "timeupdate",
  "waiting",
  "error",
  "ended",
];
const browserErrors: any = {
  1: "MEDIA_ERR_ABORTED",
  2: "MEDIA_ERR_NETWORK",
  3: "MEDIA_ERR_DECODE",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
};

const determinePreloadType = function (data: string) {
  return ["auto", "metadata"].includes(data);
};

// Returns the currently displayed text track, if captions are switched on
const identifyActiveTextTrack = function (
  media: HTMLVideoElement,
): TextTrack | undefined {
  const textTracks = media.textTracks;

  for (let index = 0; index < (textTracks?.length ?? 0); index++) {
    if (textTracks[index].mode === "showing") {
      return textTracks[index];
    }
  }
};

// Maps the playhead to wall-clock time for live and DVR streams. hls.js exposes
// it once the manifest carries EXT-X-PROGRAM-DATE-TIME; dash.js reports seconds.
const measureProgramDateTime = function (
  hlstag: any,
  dashTag: any,
): number | undefined {
  const hlsPlayingDate = hlstag?.playingDate;

  if (hlsPlayingDate instanceof Date) {
    return hlsPlayingDate.getTime();
  }

  if (typeof dashTag?.timeAsUTC === "function") {
    const dashSeconds = dashTag.timeAsUTC();

    if (typeof dashSeconds === "number" && dashSeconds > 0) {
      return Math.floor(1e3 * dashSeconds);
    }
  }
};

// Returns forward buffer in ms, measured from the range holding the playhead
const measureBufferLength = function (
  media: HTMLVideoElement,
): number | undefined {
  const buffered = media.buffered;
  const playhead = media.currentTime;

  for (let index = 0; index < (buffered?.length ?? 0); index++) {
    if (playhead >= buffered.start(index) && playhead <= buffered.end(index)) {
      return Math.floor(1e3 * (buffered.end(index) - playhead));
    }
  }
};

// Watches how much of the player sits inside the viewport. Geometric overlap on
// its own would call a backgrounded tab viewable, so the page visibility state
// is folded in as well.
const observeViewability = function (media: HTMLVideoElement) {
  const inert = {
    readState: () => ({
      player_viewable_on: undefined as boolean | undefined,
      player_viewable_percentage: undefined as number | undefined,
    }),
    disconnect: () => {},
  };

  if (typeof IntersectionObserver === "undefined" || !media) {
    return inert;
  }

  let intersecting = false;
  let ratio = 0;

  const observer = new IntersectionObserver(
    (entries) => {
      const latest = entries[entries.length - 1];
      intersecting = latest.isIntersecting;
      ratio = latest.intersectionRatio;
    },
    { threshold: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] },
  );

  observer.observe(media);

  const isHidden = () => document?.visibilityState === "hidden";

  return {
    readState: () => ({
      player_viewable_on: intersecting && !isHidden(),
      player_viewable_percentage: isHidden() ? 0 : Math.round(100 * ratio),
    }),
    disconnect: () => observer.disconnect(),
  };
};

const fastpixMetrix = {
  tracker: function (videoTag: any, userData: EventMetaData) {
    const videoParams = analyzeVideo(videoTag);
    const videoContainer = videoParams[0];
    const videoString = videoParams[2];
    const hlstag = userData.hlsjs;
    const dashTag = userData.dashPlayer;
    const hlsPlayer: any = userData.Hls ?? (window as any).Hls;
    const dashPlayer: any = userData.dashjs ?? (window as any).dashjs;
    let playerType: "hls" | "dash" | "unknown" = "unknown";

    if (hlsPlayer) {
      playerType = "hls";
    } else if (dashPlayer) {
      playerType = "dash";
    }
    if (!videoContainer) {
      return console.error(
        "There are no elements found matching the query selector " +
          videoContainer +
          ".",
      );
    }

    if ("video" !== videoString && "audio" !== videoString) {
      return console.error(
        "The specified element with ID does not represent a media element.",
      );
    }

    if ((videoContainer as any)?.fp) {
      (videoContainer as any).fp.destroy();
    }
    const videoId: string | undefined = videoParams[1];
    const errorTracking = {
      automaticErrorTracking: userData.automaticErrorTracking ?? true,
      debug: userData.debug ?? false,
    };

    const playerConfigMap = {
      hls: {
        name: "hls.js Player",
        version: hlsPlayer?.version ?? "",
        sdk: "fastpix-hls-monitoring",
      },
      dash: {
        name: "dash.js Player",
        version: dashPlayer?.Version ?? "",
        sdk: "fastpix-dash-monitoring",
      },
      unknown: {
        name: "",
        version: "",
        sdk: "fastpix-data-monitoring",
      },
    };
    const playerConfig = playerConfigMap[playerType];
    userData = {
      ...userData,
      ...errorTracking,
    };
    userData.data = {
      player_software_name: playerConfig.name,
      player_software_version: playerConfig.version,
      player_fastpix_sdk_name: playerConfig.sdk,
      player_fastpix_sdk_version: "1.0.5",
      ...userData.data,
    };

    const viewability = observeViewability(videoContainer as HTMLVideoElement);

    // Picture in picture is usually entered and left between two beacons, so
    // sampling document.pictureInPictureElement when a beacon is built misses
    // it almost every time. Latching on the element's own events instead makes
    // the field mean "picture in picture was used during this view", which is
    // what a session level metric needs.
    let usedPip = false;
    const pipMedia = videoContainer as HTMLVideoElement;

    pipMedia.addEventListener("enterpictureinpicture", () => {
      usedPip = true;
    });

    // Safari has never shipped the standard API for video elements - it
    // signals picture in picture through presentation mode, so the standard
    // event never fires there and this is the only way to observe it.
    pipMedia.addEventListener("webkitpresentationmodechanged", () => {
      if ((pipMedia as any).webkitPresentationMode === "picture-in-picture") {
        usedPip = true;
      }
    });

    // A new source is a new view, and this closure cannot reach configureView
    // to reset alongside the other per view state
    pipMedia.addEventListener("loadstart", () => {
      usedPip = false;
    });

    // Read once, at setup. Chrome's native speed control writes
    // defaultPlaybackRate alongside playbackRate, so re-reading it on every
    // beacon would report the viewer's choice as the application's default and
    // the two fields could never disagree.
    const configuredPlaybackRate = (videoContainer as HTMLVideoElement)
      .defaultPlaybackRate;

    userData.fetchPlayheadTime = function () {
      return Math.floor(1e3 * (videoContainer as HTMLVideoElement).currentTime);
    };

    userData.fetchStateData = function () {
      let obj;
      let droppedFrameCount;
      const hlsurl = hlstag?.url;
      const dashUrl =
        dashTag &&
        "function" === typeof dashTag.getSource &&
        dashTag.getSource();
      const activeTextTrack = identifyActiveTextTrack(
        videoContainer as HTMLVideoElement,
      );

      const viewableState = viewability.readState();
      const activeAudioLanguage =
        hlstag?.audioTracks?.[hlstag.audioTrack]?.lang ??
        (dashTag && "function" === typeof dashTag.getCurrentTrackFor
          ? dashTag.getCurrentTrackFor("audio")?.lang
          : void 0);

      const statsData = {
        player_is_paused: (videoContainer as HTMLVideoElement).paused,
        player_width: videoContainer.offsetWidth,
        player_height: videoContainer.offsetHeight,
        player_autoplay_on: (videoContainer as HTMLVideoElement).autoplay,
        player_preload_on: determinePreloadType(
          (videoContainer as HTMLVideoElement).preload,
        ),
        player_is_fullscreen:
          document &&
          !!(
            document.fullscreenElement ??
            (document === null || document === void 0
              ? void 0
              : (document as any).webkitFullscreenElement) ??
            (document === null || document === void 0
              ? void 0
              : (document as any).mozFullScreenElement) ??
            (document === null || document === void 0
              ? void 0
              : (document as any).msFullscreenElement)
          ),
        player_is_pip:
          usedPip || document?.pictureInPictureElement === videoContainer,
        player_muted: (videoContainer as HTMLVideoElement).muted,
        player_default_muted_on: (videoContainer as HTMLVideoElement)
          .defaultMuted,
        player_volume_level: (videoContainer as HTMLVideoElement).volume,
        player_playback_rate: (videoContainer as HTMLVideoElement).playbackRate,
        player_default_playback_rate: configuredPlaybackRate,
        player_loop_on: (videoContainer as HTMLVideoElement).loop,
        player_controls_on: (videoContainer as HTMLVideoElement).controls,
        player_subtitles_on: !!activeTextTrack,
        player_subtitles_language_code: activeTextTrack?.language,
        player_audio_language_code: activeAudioLanguage,
        video_source_height: (videoContainer as HTMLVideoElement).videoHeight,
        video_source_width: (videoContainer as HTMLVideoElement).videoWidth,
        video_source_url:
          hlsurl ?? dashUrl ?? (videoContainer as HTMLVideoElement).currentSrc,
        video_source_stream_protocol: identifyStreamingProtocol(
          hlsurl ?? dashUrl ?? (videoContainer as HTMLVideoElement).currentSrc,
        ),
        video_source_domain: getDomainName(
          hlsurl ?? dashUrl ?? (videoContainer as HTMLVideoElement).currentSrc,
        ),
        video_source_hostname: getHostName(
          hlsurl ?? dashUrl ?? (videoContainer as HTMLVideoElement).currentSrc,
        ),
        video_source_duration: Math.floor(
          1e3 * (videoContainer as HTMLVideoElement).duration,
        ),
        video_source_buffer_length: measureBufferLength(
          videoContainer as HTMLVideoElement,
        ),
        player_program_date_time: measureProgramDateTime(hlstag, dashTag),
        video_poster_url: (videoContainer as HTMLVideoElement).poster,
        player_language_code: videoContainer.lang,
        player_viewable_on: viewableState.player_viewable_on,
        player_viewable_percentage: viewableState.player_viewable_percentage,
        view_dropped_frame_count:
          null === (obj = videoContainer as HTMLVideoElement) ||
          void 0 === obj ||
          null === (droppedFrameCount = obj.getVideoPlaybackQuality) ||
          void 0 === droppedFrameCount
            ? void 0
            : droppedFrameCount.call(obj).droppedVideoFrames,
      };

      return statsData;
    };

    (videoContainer as any).fp = (videoContainer as any).fp ?? {};
    (videoContainer as any).fp.dispatch = (name: string, eventName: any) => {
      this.dispatch(videoId, name, eventName);
    };
    (videoContainer as any).fp.listeners = {};
    (videoContainer as any).fp.deleted = false;
    (videoContainer as any).fp.destroy = function () {
      Object.keys((videoContainer as any).fp.listeners).forEach(
        function (name) {
          (videoContainer as any).removeEventListener(
            name,
            (videoContainer as any).fp.listeners[name],
            false,
          );
        },
      );
      delete (videoContainer as any).fp.listeners;
      viewability.disconnect();

      if (playerType === "hls" && videoContainer.fp?.destroyHlsMonitoring) {
        (videoContainer as any).fp?.destroyHlsMonitoring();
      } else if (
        playerType === "dash" &&
        videoContainer.fp?.destroyDashMonitoring
      ) {
        (videoContainer as any).fp?.destroyDashMonitoring();
      }

      (videoContainer as any).fp.deleted = true;
      (videoContainer as any).fp.dispatch("destroy");
      delete (videoContainer as any)?.fp;
    };

    this.configure(videoId, userData);
    this.dispatch(videoId, "playerReady");

    if (!(videoContainer as HTMLVideoElement).paused) {
      this.dispatch(videoId, "play");

      if ((videoContainer as HTMLVideoElement).readyState > 2) {
        this.dispatch(videoId, "playing");
      }
    }

    html5VideoEvents.forEach((event) => {
      if ("error" !== event || userData.automaticErrorTracking) {
        (videoContainer as any).fp.listeners[event] = () => {
          let browserObj: any = {};

          if ("error" === event) {
            if (
              !(videoContainer as HTMLVideoElement).error ||
              1 === (videoContainer as HTMLVideoElement).error?.code
            ) {
              return;
            }
            browserObj.player_error_code = (
              videoContainer as HTMLVideoElement
            ).error?.code;
            browserObj.player_error_message =
              browserErrors[(videoContainer as any).error?.code] ??
              (videoContainer as HTMLVideoElement).error?.message;
            // MEDIA_ERR_ABORTED is filtered out above, so whatever reaches this
            // point ended playback
            browserObj.player_error_severity = "fatal";
          }
          this.dispatch(videoId, event, browserObj);
        };
        videoContainer.addEventListener(
          event,
          (videoContainer as any).fp.listeners[event],
          false,
        );
      }
    });

    const dispatchEvent = (
      type: string,
      data: {
        request_event_type?: any;
        request_bytes_loaded?: any;
        request_start?: number;
        request_response_start?: number;
        request_response_end?: number;
        request_type?: string;
        request_hostname?: string;
        request_response_headers?: any;
        video_source_fps?: number;
        video_source_bitrate?: any;
        video_source_width?: any;
        video_source_height?: any;
        video_source_rendition_name?: any;
        video_source_codec?: any;
        request_url?: any;
        player_error_code?: string;
        player_error_message?: any;
        player_error_context?: string;
        player_error_severity?: string;
        request_error?: any;
        request_error_code?: number;
        request_error_text?: string;
      },
    ) => (videoContainer as any).fp.dispatch(type, data);

    if (hlstag) {
      setupHlsMonitoring(
        hlstag,
        hlsPlayer,
        videoContainer,
        errorTracking,
        dispatchEvent,
      );
    }

    if (dashTag?.on) {
      setupDashMonitoring(
        dashTag,
        videoContainer,
        errorTracking,
        dispatchEvent,
      );
    }
  },
  utilityMethods: utilityMethods,
  configure: function (name: string | undefined, props: any) {
    if (checkDoNotTrack()) {
      if (props?.respectDoNotTrack && props?.debug) {
        console.warn(
          "The browser's Do Not Track flag is enabled - fastpix beaconing is disabled.",
        );
      }
    }

    if (name) {
      const dispatchKey: string | undefined = identifyElement(name);
      if (dispatchKey) {
        // @ts-ignore
        contextState[dispatchKey] = new nucleusState(this, dispatchKey, props);
      }
    }
  },
  dispatch: function (
    eventName: string | undefined,
    name: string,
    event?: EventMetaData,
  ) {
    if (eventName && name) {
      const dispatchKey: string | undefined = identifyElement(eventName);

      if (dispatchKey && contextState[dispatchKey]) {
        // @ts-ignore
        contextState[dispatchKey].dispatch(name, event);

        if ("destroy" === name) {
          delete contextState[dispatchKey];
        }
      } else {
        console.warn(
          "The initialization of the monitor for the dispatch key '" +
            dispatchKey +
            "' is pending.",
        );
      }
    }
  },
};

export type { EventMetaData } from "./DataType/index";

export default fastpixMetrix;

if (typeof window !== "undefined") {
  (window as any).fastpixMetrix = fastpixMetrix;
}
