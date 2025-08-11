import {
  getDomainName,
  getHostName,
  analyzeVideo,
  identifyElement,
  checkDoNotTrack,
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
      ...userData.data,
      player_software_name: playerConfig.name,
      player_software_version: playerConfig.version,
      player_fastpix_sdk_name: playerConfig.sdk,
      player_fastpix_sdk_version: "1.0.4",
    };

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
      const dashUrl =
        dashTag &&
        "function" === typeof dashTag.getSource &&
        dashTag.getSource();

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
          hlsurl ?? dashUrl ?? (videoContainer as HTMLVideoElement).currentSrc,
        video_source_domain: getDomainName(
          hlsurl ?? dashUrl ?? (videoContainer as HTMLVideoElement).currentSrc,
        ),
        video_source_hostname: getHostName(
          hlsurl ?? dashUrl ?? (videoContainer as HTMLVideoElement).currentSrc,
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

export default fastpixMetrix;

if (typeof window !== "undefined") {
  (window as any).fastpixMetrix = fastpixMetrix;
}
