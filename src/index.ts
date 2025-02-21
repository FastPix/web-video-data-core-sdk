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
import { EventData, EventMetaData } from "./DataType/index";
import { nucleusState } from "./MonitorMetrics/index";

const contextState: any = {};
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
  tracker: function (videoTag: any, userData: any) {
    const videoParams = analyzeVideo(videoTag);
    const videoContainer: HTMLVideoElement | any = videoParams[0];
    const videoId: string | any = videoParams[1];
    const videoString = videoParams[2];
    const hlstag = userData.hlsjs;
    const hlsPlayer: any = userData.Hls || (window as any).Hls;
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
        "The specified element with ID " +
          videoId +
          " does not represent a media element.",
      );
    }
    videoContainer.fp = {} || videoContainer.fp;

    const errorTracking = {
      automaticErrorTracking: userData.automaticErrorTracking
        ? userData.automaticErrorTracking
        : true,
    };
    userData = Object.assign(errorTracking, userData);
    userData.data = Object.assign(userData.data, {
      player_software_name: "HTML5 Video Element",
      player_software_version: hlsPlayer.version || "1.0.0",
      player_fastpix_sdk_name: "Web Video Element Monitor",
      player_fastpix_sdk_version: "1.0.0",
    });

    const determinePreloadType = function (data: string) {
      return ["auto", "metadata"].includes(data);
    };

    userData.fetchPlayheadTime = function () {
      return Math.floor(1e3 * videoContainer.currentTime);
    };

    userData.fetchStateData = function () {
      let obj;
      let droppedFrameCount;
      const hlsurl = hlstag && hlstag.url;
      const statsData = {
        player_is_paused: videoContainer.paused,
        player_width: videoContainer.offsetWidth,
        player_height: videoContainer.offsetHeight,
        player_autoplay_on: videoContainer.autoplay,
        player_preload_on: determinePreloadType(videoContainer.preload),
        player_is_fullscreen:
          document &&
          !!(
            document.fullscreenElement ||
            (document === null || document === void 0
              ? void 0
              : (document as any).webkitFullscreenElement) ||
            (document === null || document === void 0
              ? void 0
              : (document as any).mozFullScreenElement) ||
            (document === null || document === void 0
              ? void 0
              : (document as any).msFullscreenElement)
          ),
        video_source_height: videoContainer.videoHeight,
        video_source_width: videoContainer.videoWidth,
        video_source_url: hlsurl || videoContainer.currentSrc,
        video_source_domain: getDomainName(hlsurl || videoContainer.currentSrc),
        video_source_hostname: getHostName(hlsurl || videoContainer.currentSrc),
        video_source_duration: Math.floor(1e3 * videoContainer.duration),
        video_poster_url: videoContainer.poster,
        player_language_code: videoContainer.lang,
        view_dropped_frame_count:
          null === (obj = videoContainer) ||
          void 0 === obj ||
          null === (droppedFrameCount = obj.getVideoPlaybackQuality) ||
          void 0 === droppedFrameCount
            ? void 0
            : droppedFrameCount.call(obj).droppedVideoFrames,
      };

      return statsData;
    };

    videoContainer.fp = videoContainer.fp || {};
    videoContainer.fp.dispatch = function (name: string, eventName: any) {
      targetObject.dispatch(videoId, name, eventName);
    };
    videoContainer.fp.listeners = {};
    videoContainer.fp.deleted = false;
    videoContainer.fp.destroy = function () {
      Object.keys(videoContainer.fp.listeners).forEach(function (name) {
        videoContainer.removeEventListener(
          name,
          videoContainer.fp.listeners[name],
          false,
        );
      });
      delete videoContainer.fp.listeners;
      videoContainer.fp.deleted = true;
      videoContainer.fp.dispatch("destroy");
    };

    targetObject.configure(videoId, userData);
    targetObject.dispatch(videoId, "playerReady");

    if (!videoContainer.paused) {
      targetObject.dispatch(videoId, "play");

      if (videoContainer.readyState > 2) {
        targetObject.dispatch(videoId, "playing");
      }
    }

    html5VideoEvents.forEach(function (event) {
      if (!("error" === event && !userData.automaticErrorTracking)) {
        videoContainer.fp.listeners[event] = function () {
          let browserObj: any = {};

          if ("error" === event) {
            if (!videoContainer.error || 1 === videoContainer.error.code) {
              return;
            }
            browserObj.player_error_code = videoContainer.error.code;
            browserObj.player_error_message =
              browserErrors[videoContainer.error.code] ||
              videoContainer.error.message;
          }
          targetObject.dispatch(videoId, event, browserObj);
        };
        videoContainer.addEventListener(
          event,
          videoContainer.fp.listeners[event],
          false,
        );
      }
    });

    if (hlstag) {
      const calculateRequestData = (stats: any) =>
        getRequestTimingDetails(stats);
      const hlsProgress = function (object: any) {
        let objLength;
        const replace = parseInt(hlsPlayer.version);

        return (
          1 === replace &&
            null !== object.programDateTime &&
            (objLength = object.programDateTime),
          0 === replace && null !== object.pdt && (objLength = object.pdt),
          objLength
        );
      };

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
        data: EventMetaData | EventData | any,
      ) => videoContainer.fp.dispatch(type, data);

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
        const programDateTime =
          hlsProgress(levelData.fragments[levelData.fragments.length - 1]) +
          parseInt(
            levelData.fragments[levelData.fragments.length - 1].duration,
          );

        const levelEventData = buildRequestEvent(
          levelLoadString,
          levelLoadEvent.stats,
          levelData.url,
          fetchHeaders(levelLoadEvent.networkDetails),
          {
            video_source_is_live: levelData.live,
            player_manifest_newest_program_time: isNaN(programDateTime)
              ? undefined
              : programDateTime,
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
          data.stats || fragDetails.stats,
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
        if (!switchLevel || !switchLevel.attrs?.BANDWIDTH) {
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
          type: any;
          details: any;
          frag: { url: any };
          url: any;
          response: { code: any; text: any };
          fatal: any;
        },
      ) => {
        const errorType = data.type;
        const errorDetails = data.details;
        const errorUrl = data.frag?.url || data.url || "";

        if (
          [
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
          ].includes(errorDetails)
        ) {
          const requestType = errorDetails.includes("FRAG")
            ? "media"
            : errorDetails.includes("AUDIO_TRACK")
              ? "audio"
              : errorDetails.includes("SUBTITLE")
                ? "subtitle"
                : errorDetails.includes("KEY")
                  ? "encryption"
                  : "manifest";

          const errorData = {
            request_error: errorDetails,
            request_url: errorUrl,
            request_hostname: getHostName(errorUrl),
            request_type: requestType,
            request_error_code: data.response?.code,
            request_error_text: data.response?.text,
          };
          dispatchEvent("requestFailed", errorData);

          if (data.fatal) {
            const errorContext = `${errorUrl ? `url: ${errorUrl}\n` : ""}${data.response?.code || data.response?.text ? `response: ${data.response.code}, ${data.response.text}\n` : ""}`;
            if (errorTracking.automaticErrorTracking) {
              dispatchEvent("error", {
                player_error_code: errorType,
                player_error_message: errorDetails,
                player_error_context: errorContext,
              });
            }
          }
        }
      };

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
    }
  },
  utilityMethods: utilityMethods,
  configure: function (name: string, props: any) {
    if (checkDoNotTrack()) {
      if (props) {
        if (props.respectDoNotTrack && props?.debug) {
          console.warn(
            "The browser's Do Not Track flag is enabled - fastpix beaconing is disabled.",
          );
        }
      }
    }
    const dispatchKey: string | any = identifyElement(name);

    // @ts-ignore
    contextState[dispatchKey] = new nucleusState(this, dispatchKey, props);
  },
  dispatch: function (eventName: string, name: string, event?: EventMetaData) {
    const dispatchKey: string | any = identifyElement(eventName);

    if (contextState[dispatchKey]) {
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
  },
};

export default fastpixMetrix;

if (typeof window !== "undefined") {
  (window as any).fastpixMetrix = fastpixMetrix;
}
