import {
  getHostName,
  getRequestTimingDetails,
  fetchHeaders,
} from "../CommonMethods/index";

export const setupHlsMonitoring = (
  hlstag: any,
  hlsPlayer: any,
  videoContainer: any,
  errorTracking: any,
  dispatchEvent: (type: string, data: any) => void,
) => {
  const calculateRequestData = (stats: any) => getRequestTimingDetails(stats);

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
        request_type: fragDetails.type === "main" ? "media" : fragDetails.type,
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

  if (videoContainer?.fp) {
    videoContainer.fp.destroyHlsMonitoring = () => {
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
        videoContainer.fp?.destroyHlsMonitoring,
      );
      delete videoContainer.fp?.destroyHlsMonitoring;
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
    videoContainer.fp?.destroyHlsMonitoring,
  );
};
