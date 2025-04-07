import {
  getDomainName,
  getHostName,
  analyzeVideo,
  identifyElement,
  checkDoNotTrack,
  fetchHeaders,
  utilityMethods,
  getRequestTimingDetails,
} from "./CommonMethods/index";
import { EventMetaData } from "./DataType/index";
import { nucleusState } from "./MonitorMetrics/index";

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

const fastpixMetrix = {
  tracker: function (videoTag: any, userData: EventMetaData) {
    const videoParams = analyzeVideo(videoTag);
    const videoContainer = videoParams[0];
    const videoString = videoParams[2];
    const hlstag = userData.hlsjs;
    const hlsPlayer: any = userData.Hls ?? (window as any).Hls;
    const targetObject = this;

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
    };
    userData = Object.assign(errorTracking, userData);
    userData.data = Object.assign(userData.data, {
      player_software_name: "HLS.js Player",
      player_software_version: hlsPlayer.version ?? "",
      player_fastpix_sdk_name: "fastpix-hls-monitoring",
      player_fastpix_sdk_version: "1.0.1",
    });

    const determinePreloadType = function (data: string) {
      return ["auto", "metadata"].includes(data);
    };

    userData.fetchPlayheadTime = function () {
      return Math.floor(1e3 * (videoContainer as HTMLVideoElement).currentTime);
    };

    userData.fetchStateData = function () {
      let obj;
      let droppedFrameCount;
      const hlsurl = hlstag?.url;
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
        video_source_height: (videoContainer as HTMLVideoElement).videoHeight,
        video_source_width: (videoContainer as HTMLVideoElement).videoWidth,
        video_source_url:
          hlsurl ?? (videoContainer as HTMLVideoElement).currentSrc,
        video_source_domain: getDomainName(
          hlsurl ?? (videoContainer as HTMLVideoElement).currentSrc,
        ),
        video_source_hostname: getHostName(
          hlsurl ?? (videoContainer as HTMLVideoElement).currentSrc,
        ),
        video_source_duration: Math.floor(
          1e3 * (videoContainer as HTMLVideoElement).duration,
        ),
        video_poster_url: (videoContainer as HTMLVideoElement).poster,
        player_language_code: videoContainer.lang,
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
    (videoContainer as any).fp.dispatch = function (
      name: string,
      eventName: any,
    ) {
      targetObject.dispatch(videoId, name, eventName);
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
      (videoContainer as any).fp!.destroyHlsMonitoring();
      (videoContainer as any).fp.deleted = true;
      (videoContainer as any).fp.dispatch("destroy");
      delete (videoContainer as any)?.fp;
    };

    targetObject.configure(videoId, userData);
    targetObject.dispatch(videoId, "playerReady");

    if (!(videoContainer as HTMLVideoElement).paused) {
      targetObject.dispatch(videoId, "play");

      if ((videoContainer as HTMLVideoElement).readyState > 2) {
        targetObject.dispatch(videoId, "playing");
      }
    }

    html5VideoEvents.forEach(function (event) {
      if (!("error" === event && !userData.automaticErrorTracking)) {
        (videoContainer as any).fp.listeners[event] = function () {
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
          }
          targetObject.dispatch(videoId, event, browserObj);
        };
        videoContainer.addEventListener(
          event,
          (videoContainer as any).fp.listeners[event],
          false,
        );
      }
    });

    if (hlstag) {
      const calculateRequestData = (stats: any) =>
        getRequestTimingDetails(stats);

      const buildRequestEvent = (
        eventType: string,
        stats: string,
        url: string,
        headers: any,
        details = {},
      ) => {
        const timerData = calculateRequestData(stats);
        return {
          request_event_type: eventType,
          request_bytes_loaded: timerData.bytesLoaded,
          request_start: timerData.requestStart,
          request_response_start: timerData.responseStart,
          request_response_end: timerData.responseEnd,
          request_type: "manifest",
          request_hostname: getHostName(url),
          request_response_headers: headers,
          ...details,
        };
      };

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
          request_error?: any;
          request_error_code?: number;
          request_error_text?: string;
        },
      ) => (videoContainer as any).fp.dispatch(type, data);

      const handleManifestLoaded = (
        position: any,
        data: {
          levels: any[];
          audioTracks: any[];
          stats: any;
          url: any;
          networkDetails: any;
        },
      ) => {
        const sourceLevels = data.levels.map(
          (level: { width: any; height: any; bitrate: any; attrs: any }) => ({
            width: level.width,
            height: level.height,
            bitrate: level.bitrate,
            attrs: level.attrs,
          }),
        );

        const audioTracks = data.audioTracks.map(
          (track: { name: any; lang: any; bitrate: any }) => ({
            name: track.name,
            language: track.lang,
            bitrate: track.bitrate,
          }),
        );

        const manifestData = buildRequestEvent(
          position,
          data.stats,
          data.url,
          fetchHeaders(data.networkDetails),
          {
            request_rendition_lists: {
              media: sourceLevels,
              audio: audioTracks,
              video: {},
            },
          },
        );

        dispatchEvent("requestCompleted", manifestData);
      };

      const handleLevelLoaded = (
        levelLoadString: any,
        levelLoadEvent: { details: any; stats: any; networkDetails: any },
      ) => {
        const levelData = levelLoadEvent.details;
        const levelEventData = buildRequestEvent(
          levelLoadString,
          levelLoadEvent.stats,
          levelData.url,
          fetchHeaders(levelLoadEvent.networkDetails),
          {
            video_source_is_live: levelData.live,
          },
        );

        dispatchEvent("requestCompleted", levelEventData);
      };

      const handleTrackLoaded = (
        total: any,
        data: { stats: any; details: { url: any }; networkDetails: any },
      ) => {
        const trackEvent = buildRequestEvent(
          total,
          data.stats,
          data.details.url,
          fetchHeaders(data.networkDetails),
        );
        dispatchEvent("requestCompleted", trackEvent);
      };

      const handleFragmentLoaded = (
        fragEvent: any,
        data: { frag: any; stats: any; networkDetails: { responseURL: any } },
      ) => {
        const fragDetails = data.frag;
        const fragData = buildRequestEvent(
          fragEvent,
          data.stats ?? fragDetails.stats,
          data.networkDetails?.responseURL,
          fetchHeaders(data.networkDetails),
          {
            request_type:
              fragDetails.type === "main" ? "media" : fragDetails.type,
            request_video_width: hlstag.levels[fragDetails.level]?.width,
            request_video_height: hlstag.levels[fragDetails.level]?.height,
          },
        );

        dispatchEvent("requestCompleted", fragData);
      };

      const handleLevelSwitched = (
        _token: any,
        lvl: { level: string | number },
      ) => {
        const switchLevel = hlstag.levels[lvl.level];
        if (!switchLevel?.attrs?.BANDWIDTH) {
          if (userData?.debug)
            console.warn(
              "missing BANDWIDTH from HLS manifest parsed by HLS.js",
            );
          return;
        }

        const levelSwitchEvent = {
          video_source_fps:
            parseFloat(switchLevel.attrs["FRAME-RATE"]) || undefined,
          video_source_bitrate: switchLevel.attrs.BANDWIDTH,
          video_source_width: switchLevel.width,
          video_source_height: switchLevel.height,
          video_source_rendition_name: switchLevel.name,
          video_source_codec: switchLevel.videoCodec,
        };
        dispatchEvent("variantChanged", levelSwitchEvent);
      };

      const handleFragmentAborted = (
        canceledEvent: any,
        canceledState: { frag: { _url: string } },
      ) => {
        const fragUrl = canceledState.frag?._url || "";
        dispatchEvent("requestCanceled", {
          request_event_type: canceledEvent,
          request_url: fragUrl,
          request_type: "media",
          request_hostname: getHostName(fragUrl),
        });
      };

      const handleError = (
        _accessor: any,
        data: {
          type: string;
          details: any;
          frag?: { url: string };
          url?: any;
          response?: { code: number; text: string };
          fatal: boolean;
          reason?: string;
          level?: string;
          error?: string;
          event?: string;
          err?: { message: string };
        },
      ) => {
        const {
          type: errorType,
          details: errorDetails,
          frag,
          url,
          response,
          fatal,
          reason,
          level,
          error,
          event,
          err,
        } = data;

        const errorUrl = frag?.url ?? url ?? "";
        const errorContext = [
          errorUrl ? `url: ${errorUrl}` : "",
          response?.code || response?.text
            ? `response: ${response.code}, ${response.text}`
            : "",
          reason ? `failure reason: ${reason}` : "",
          level ? `level: ${level}` : "",
          error ? `error: ${error}` : "",
          event ? `event: ${event}` : "",
          err?.message ? `error message: ${err.message}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        if (fatal && errorTracking?.automaticErrorTracking) {
          dispatchEvent("error", {
            player_error_code: errorType,
            player_error_message: errorDetails,
            player_error_context: errorContext,
          });
          return;
        }

        const loadErrors = new Set([
          hlsPlayer.ErrorDetails.MANIFEST_LOAD_ERROR,
          hlsPlayer.ErrorDetails.MANIFEST_LOAD_TIMEOUT,
          hlsPlayer.ErrorDetails.FRAG_LOAD_ERROR,
          hlsPlayer.ErrorDetails.FRAG_LOAD_TIMEOUT,
          hlsPlayer.ErrorDetails.LEVEL_LOAD_ERROR,
          hlsPlayer.ErrorDetails.LEVEL_LOAD_TIMEOUT,
          hlsPlayer.ErrorDetails.AUDIO_TRACK_LOAD_ERROR,
          hlsPlayer.ErrorDetails.AUDIO_TRACK_LOAD_TIMEOUT,
          hlsPlayer.ErrorDetails.SUBTITLE_LOAD_ERROR,
          hlsPlayer.ErrorDetails.SUBTITLE_LOAD_TIMEOUT,
          hlsPlayer.ErrorDetails.KEY_LOAD_ERROR,
          hlsPlayer.ErrorDetails.KEY_LOAD_TIMEOUT,
        ]);

        if (loadErrors.has(errorDetails)) {
          const requestTypeMap: Record<string, string> = {
            [hlsPlayer.ErrorDetails.FRAG_LOAD_ERROR]: "media",
            [hlsPlayer.ErrorDetails.FRAG_LOAD_TIMEOUT]: "media",
            [hlsPlayer.ErrorDetails.AUDIO_TRACK_LOAD_ERROR]: "audio",
            [hlsPlayer.ErrorDetails.AUDIO_TRACK_LOAD_TIMEOUT]: "audio",
            [hlsPlayer.ErrorDetails.SUBTITLE_LOAD_ERROR]: "subtitle",
            [hlsPlayer.ErrorDetails.SUBTITLE_LOAD_TIMEOUT]: "subtitle",
            [hlsPlayer.ErrorDetails.KEY_LOAD_ERROR]: "encryption",
            [hlsPlayer.ErrorDetails.KEY_LOAD_TIMEOUT]: "encryption",
          };

          const requestType = requestTypeMap[errorType] ?? "manifest";

          dispatchEvent("requestFailed", {
            request_error: errorDetails,
            request_url: errorUrl,
            request_hostname: getHostName(errorUrl),
            request_type: requestType,
            request_error_code: response?.code,
            request_error_text: response?.text,
          });
        }
      };

      if ((videoContainer as any)?.fp) {
        (videoContainer as any).fp.destroyHlsMonitoring = () => {
          hlstag.off(hlsPlayer.Events.MANIFEST_LOADED, handleManifestLoaded);
          hlstag.off(hlsPlayer.Events.LEVEL_LOADED, handleLevelLoaded);
          hlstag.off(hlsPlayer.Events.AUDIO_TRACK_LOADED, handleTrackLoaded);
          hlstag.off(hlsPlayer.Events.FRAG_LOADED, handleFragmentLoaded);
          hlstag.off(hlsPlayer.Events.LEVEL_SWITCHED, handleLevelSwitched);
          hlstag.off(
            hlsPlayer.Events.FRAG_LOAD_EMERGENCY_ABORTED,
            handleFragmentAborted,
          );
          hlstag.off(hlsPlayer.Events.ERROR, handleError);
          hlstag.off(
            hlsPlayer.Events.DESTROYING,
            (videoContainer as any).fp?.destroyHlsMonitoring,
          );
          delete (videoContainer as any).fp?.destroyHlsMonitoring;
        };
      }

      // Attach event listeners
      hlstag.on(hlsPlayer.Events.MANIFEST_LOADED, handleManifestLoaded);
      hlstag.on(hlsPlayer.Events.LEVEL_LOADED, handleLevelLoaded);
      hlstag.on(hlsPlayer.Events.AUDIO_TRACK_LOADED, handleTrackLoaded);
      hlstag.on(hlsPlayer.Events.FRAG_LOADED, handleFragmentLoaded);
      hlstag.on(hlsPlayer.Events.LEVEL_SWITCHED, handleLevelSwitched);
      hlstag.on(
        hlsPlayer.Events.FRAG_LOAD_EMERGENCY_ABORTED,
        handleFragmentAborted,
      );
      hlstag.on(hlsPlayer.Events.ERROR, handleError);
      hlstag.on(
        hlsPlayer.Events.DESTROYING,
        (videoContainer as any).fp?.destroyHlsMonitoring,
      );
    }
  },
  utilityMethods: utilityMethods,
  configure: function (name: string | undefined, props: any) {
    if (checkDoNotTrack()) {
      if (props) {
        if (props.respectDoNotTrack && props?.debug) {
          console.warn(
            "The browser's Do Not Track flag is enabled - fastpix beaconing is disabled.",
          );
        }
      }
    }

    if (name) {
      const dispatchKey: string | undefined = identifyElement(name);

      // @ts-ignore
      contextState[dispatchKey] = new nucleusState(this, dispatchKey, props);
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

export default fastpixMetrix;

if (typeof window !== "undefined") {
  (window as any).fastpixMetrix = fastpixMetrix;
}
