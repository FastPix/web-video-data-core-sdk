import {
  getHostName,
  getRequestTimingDetails,
  fetchHeaders,
  parseCmcdPayload,
  buildRenditionName,
} from "../CommonMethods/index";

export const setupHlsMonitoring = (
  hlstag: any,
  hlsPlayer: any,
  videoContainer: any,
  errorTracking: any,
  dispatchEvent: (type: string, data: any) => void,
) => {
  // hls.js does not wrap listener dispatch when its own debug config is on, so
  // an exception thrown here lands inside whatever the player was doing and can
  // break playback. With debug off it is caught, but the throw still aborts the
  // remaining listeners on that event - including the integrator's own. Nothing
  // this monitor does is worth either outcome, so every listener body is sealed
  // and a failure costs at most the one measurement.
  const guard =
    (_label: string, handler: (...args: any[]) => void) =>
    (...args: any[]) => {
      try {
        handler(...args);
      } catch {}
    };

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
      request_url: url ?? "",
      request_response_headers: headers,
      ...parseCmcdPayload(url),
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
    // A new manifest is a new view, and its preroll deserves its own request
    // signal even though the previous view already sent one.
    prerollDispatched = false;

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

  // HLS has no way to declare audio bitrate - EXT-X-MEDIA carries no bandwidth
  // attribute - so it is measured from the audio fragments themselves. A rolling
  // mean over the last few smooths out the variation between segments, and the
  // result is snapped to a 16 kbps step so one encode reads as one rendition
  // rather than a scatter of near identical values.
  const audioSampleWindow: number[] = [];
  let measuredAudioBitrate: number | undefined;

  const measureAudioBitrate = (frag: any, stats: any) => {
    const bytes = stats?.total ?? frag?.stats?.total;
    const seconds = frag?.duration;
    // Named rather than inlined as negated comparisons. Both are optional and
    // arrive undefined on a fragment that carries no stats, and `bytes <= 0`
    // would read that as measurable where `!(bytes > 0)` correctly rejects it -
    // the division would then push NaN into the rolling average.
    const hasBytes = bytes > 0;
    const hasDuration = seconds > 0;

    if (!hasBytes || !hasDuration) {
      return;
    }

    audioSampleWindow.push((bytes * 8) / seconds);

    if (audioSampleWindow.length > 5) {
      audioSampleWindow.shift();
    }

    const mean =
      audioSampleWindow.reduce((sum, rate) => sum + rate, 0) /
      audioSampleWindow.length;

    measuredAudioBitrate = Math.round(mean / 16000) * 16000;
  };

  const handleFragmentLoaded = (
    fragEvent: any,
    data: { frag: any; stats: any; networkDetails: { responseURL: any } },
  ) => {
    const fragDetails = data.frag;

    if (fragDetails?.type === "audio") {
      measureAudioBitrate(fragDetails, data.stats ?? fragDetails.stats);
    }

    const fragData = buildRequestEvent(
      fragEvent,
      data.stats ?? fragDetails.stats,
      data.networkDetails?.responseURL,
      fetchHeaders(data.networkDetails),
      {
        request_type: fragDetails.type === "main" ? "media" : fragDetails.type,
        request_video_width: hlstag.levels[fragDetails.level]?.width,
        request_video_height: hlstag.levels[fragDetails.level]?.height,
        // Carried on the fragment event because the rendition switch that
        // normally reports it happens before any audio has been fetched
        video_source_audio_bitrate: measuredAudioBitrate,
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

    // The declared figure is preferred when a manifest carries one, but hls.js
    // reports 0 for the usual case where it does not, so the measured value
    // stands in
    const declaredAudioBitrate =
      hlstag.audioTracks?.[hlstag.audioTrack]?.bitrate;

    const levelSwitchEvent = {
      video_source_audio_bitrate:
        declaredAudioBitrate > 0 ? declaredAudioBitrate : measuredAudioBitrate,
      video_source_fps:
        Number.parseFloat(switchLevel.attrs["FRAME-RATE"]) || undefined,
      video_source_bitrate: switchLevel.attrs.BANDWIDTH,
      video_source_width: switchLevel.width,
      video_source_height: switchLevel.height,
      video_source_rendition_name: buildRenditionName(
        switchLevel.width,
        switchLevel.height,
        switchLevel.attrs["VIDEO-RANGE"],
      ),
      video_source_codec: switchLevel.videoCodec,
      video_source_audio_codec: switchLevel.audioCodec,
      video_source_dynamic_range_type: switchLevel.attrs["VIDEO-RANGE"],
    };
    dispatchEvent("variantChanged", levelSwitchEvent);
  };

  // hls.js reports interstitial durations and offsets on the media timeline, in
  // seconds. Every other duration the SDK sends is milliseconds, and the DASH ad
  // path converts, so without this the same five second ad reports 5 on HLS and
  // 5000 on DASH.
  // Where the break sits relative to the content. Read from the CUE attribute
  // rather than the marker's timestamp, so a preroll a packager dated later
  // still reads as a preroll.
  const breakPositionOf = (cue: any): "preroll" | "postroll" | "midroll" => {
    if (cue?.pre) {
      return "preroll";
    }

    if (cue?.post) {
      return "postroll";
    }

    return "midroll";
  };

  const toMilliseconds = (seconds: any): number | undefined =>
    typeof seconds === "number" && Number.isFinite(seconds)
      ? Math.round(1e3 * seconds)
      : undefined;

  // The preroll request is signalled from two places - the break opening, and
  // the asset list loading - because neither fires for every break shape. Only
  // the first counts: view_preroll_request_time is the moment the viewer began
  // waiting, and view_preroll_request_count would otherwise double for a pod.
  let prerollDispatched = false;

  const signalPrerollRequested = (breakId: any, tagUrl: any) => {
    if (prerollDispatched) {
      return;
    }

    prerollDispatched = true;
    dispatchEvent("prerollRequested", {
      view_ad_break_id: breakId,
      view_ad_tag_url: tagUrl,
    });
  };

  // HLS Interstitials (hls.js 1.5+). Feature-gated on the event constants
  // existing, so older hls.js builds skip registration and legacy CUE-OUT
  // handling is unaffected.
  const handleInterstitialStarted = guard(
    "interstitialStarted",
    (_event: any, data: any) => {
      const event = data?.event ?? data;
      const breakId = event?.identifier ?? event?.dateRange?.id;
      const position = breakPositionOf(event?.cue);

      // hls.js resolves duration through a fallback chain ending in
      // plannedDuration || 0, and an X-ASSET-LIST break has no real figure until
      // the list loads. Zero means "not known yet" rather than a zero length
      // break, so it is left out and re-read when the break ends.
      const declaredDuration = event?.duration;
      const duration =
        declaredDuration > 0 ? toMilliseconds(declaredDuration) : undefined;

      // Where the break interrupts the primary content timeline. startOffset,
      // not startTime, because a preroll interrupts nothing and must read 0
      // however the packager dated its marker - Apple's own sample stamps a
      // CUE="PRE" break at ten seconds, and startTime would report that. For
      // every other break the two are identical.
      const timeOffset = toMilliseconds(event?.startOffset);

      // A single asset gives its own URI; a pod names the list instead. Either
      // way this is the host actually serving ad media, which is what separates
      // an ad CDN problem from a content CDN problem.
      const assetUrl = event?.assetUrl ?? event?.assetListUrl;

      dispatchEvent("adbreakstart", {
        view_ad_break_id: breakId,
        view_ad_break_position: position,
        view_ad_duration: duration,
        view_ad_time_offset: timeOffset,
        view_ad_asset_hostname: assetUrl ? getHostName(assetUrl) : undefined,
        // Not a standard interstitial attribute. Present only when the SSAI
        // vendor writes it onto the EXT-X-DATERANGE.
        view_ad_system: event?.dateRange?.attr?.["X-AD-SYSTEM"],
      });

      // A single asset break (X-ASSET-URI) never triggers ASSET_LIST_LOADING, so
      // the request signal has to come from here. This used to be gated on
      // assetListUrl being absent as the test for "single asset", but hls.js
      // populates that property for those breaks too, so the condition never
      // held and no preroll ever reported a request time. Both paths now fire
      // and prerollDispatched keeps it to one per view.
      if (event?.cue?.pre) {
        signalPrerollRequested(breakId, event?.assetUrl);
      }
    },
  );

  // An X-ASSET-LIST break has no declared duration when it opens - hls.js only
  // learns the real length once it has fetched the list - so INTERSTITIAL_ENDED
  // stashes the settled figure for PRIMARY_RESUMED to send. The two fire back
  // to back, so nothing is lost by carrying it across.
  let settledBreakDuration: number | undefined;

  const handleInterstitialEnded = guard(
    "interstitialEnded",
    (_event: any, data: any) => {
      const duration = data?.event?.duration;
      settledBreakDuration =
        duration > 0 ? toMilliseconds(duration) : undefined;
    },
  );

  const handleInterstitialsPrimaryResumed = guard("primaryResumed", () => {
    dispatchEvent("adbreakend", {
      view_ad_duration: settledBreakDuration,
    });
    settledBreakDuration = undefined;
  });

  // One break may contain multiple ad assets. INTERSTITIAL_ASSET_STARTED
  // fires per asset; view_ad_asset_id carries hls.js's internal identifier
  // (generateAssetIdentifier output) rather than any VAST Ad ID.
  const handleInterstitialAssetStarted = guard(
    "assetStarted",
    (_event: any, data: any) => {
      const asset = data?.asset ?? data?.assetItem;
      const breakEvent = data?.event;
      const assetId = asset?.identifier;
      const assetIndex = data?.assetListIndex;
      const breakId = breakEvent?.identifier ?? breakEvent?.dateRange?.id;

      // adplay, not adplaying. hls.js raises this when it selects and attaches
      // the asset player - bufferAssetPlayer runs after the trigger - so no
      // frame has rendered and none may ever. An ad sitting paused on its first
      // frame reaches here exactly the same. The impression is derived in
      // nucleusState, from the media element actually reporting playback.
      dispatchEvent("adplay", {
        view_ad_break_id: breakId,
        view_ad_asset_id: assetId,
        view_ad_asset_index: assetIndex,
        view_ad_asset_url: asset?.uri,
        // Length of this one ad, as against view_ad_duration which covers the
        // whole break. Nullable on the asset item, so guarded.
        view_ad_asset_duration:
          asset?.duration > 0 ? toMilliseconds(asset.duration) : undefined,
      });
    },
  );

  // Closes an individual ad. Paired with its adplaying this is what makes ad
  // completion measurable - whether the viewer saw the whole thing or it was
  // cut short.
  const handleInterstitialAssetEnded = guard(
    "assetEnded",
    (_event: any, data: any) => {
      const asset = data?.asset ?? data?.assetItem;
      const breakEvent = data?.event;

      dispatchEvent("adended", {
        view_ad_break_id: breakEvent?.identifier ?? breakEvent?.dateRange?.id,
        view_ad_asset_id: asset?.identifier,
        view_ad_asset_index: data?.assetListIndex,
      });
    },
  );

  // The schedule is known from the manifest before playback reaches any of it,
  // so a preroll can be reported as requested even if it never plays. Paired
  // with view_preroll_played that gives a preroll fill rate.
  //
  // Fires on every playlist refresh for a live stream. Re-dispatching is
  // deliberate rather than latched here, so the flag is set again for the next
  // video after a view change.
  const handleInterstitialsUpdated = guard(
    "interstitialsUpdated",
    (_event: any, data: any) => {
      const scheduled: any[] = data?.events ?? [];
      const hasPreroll = scheduled.some((item: any) => item?.cue?.pre);

      if (!hasPreroll) {
        return;
      }

      dispatchEvent("prerollScheduled", {});
    },
  );

  // The ad request itself leaving, as distinct from the break opening. Only
  // stamped for a preroll, since that is the one whose latency the viewer
  // experiences as the video failing to start.
  const handleAssetListLoading = guard(
    "assetListLoading",
    (_event: any, data: any) => {
      const event = data?.event;
      const breakId = event?.identifier ?? event?.dateRange?.id;

      // Correlates this request with the response that answers it. Timestamp
      // order is not enough: a pod fetch and a waterfall both put several
      // requests in flight at once, and the replies can come back interleaved.
      dispatchEvent("adrequest", {
        view_ad_break_id: breakId,
        view_ad_request_id: breakId,
        view_ad_tag_url: event?.assetListUrl,
      });

      // Preroll latency is the one a viewer reads as the video failing to
      // start, so it keeps its own timestamp rather than being derived. Shares
      // the once-per-view guard with the break-opening path.
      if (event?.cue?.pre) {
        signalPrerollRequested(breakId, event?.assetListUrl);
      }
    },
  );

  // Closes the request. The pair gives ad server latency at the backend
  // without the SDK computing a duration of its own.
  const handleAssetListLoaded = guard(
    "assetListLoaded",
    (_event: any, data: any) => {
      const event = data?.event;
      const breakId = event?.identifier ?? event?.dateRange?.id;
      const assets = data?.assetListResponse?.ASSETS;

      dispatchEvent("adresponse", {
        view_ad_break_id: breakId,
        view_ad_request_id: breakId,
        // Zero is a no-fill, which is a different thing from an error and
        // needs to be visible as one.
        view_ad_response_count: Array.isArray(assets)
          ? assets.length
          : undefined,
      });
    },
  );

  const handleInterstitialAssetError = guard(
    "assetError",
    (_event: any, data: any) => {
      const asset = data?.asset ?? data?.assetItem;
      const breakEvent = data?.event;
      const assetId = asset?.identifier;
      const breakId = breakEvent?.identifier ?? breakEvent?.dateRange?.id;
      const errorDetails = data?.error?.message ?? data?.details;

      dispatchEvent("aderror", {
        view_ad_break_id: breakId,
        view_ad_asset_id: assetId,
        view_ad_asset_index: data?.assetListIndex,
        view_ad_asset_url: asset?.uri,
        // Names the player that raised it. A player error and a VAST error
        // share no numbering, so the code is uninterpretable without this.
        view_ad_error_source: "hlsjs",
        view_ad_error_code: data?.details,
        view_ad_error_message: errorDetails,
        // hls.js forces fatal false on the interstitial payload itself, so the
        // underlying error is what says whether the break survived.
        view_ad_error_fatal: data?.error?.fatal ?? data?.fatal,
      });
    },
  );

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

    // Only fatal errors are reported. Non fatal hls.js errors are frequent and
    // recoverable, and reporting them would latch the view into an error state.
    if (fatal && errorTracking?.automaticErrorTracking) {
      dispatchEvent("error", {
        player_error_code: errorType,
        player_error_message: errorDetails,
        player_error_context: errorContext,
        player_error_severity: "fatal",
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
      if (hlsPlayer.Events.INTERSTITIAL_STARTED) {
        hlstag.off(
          hlsPlayer.Events.INTERSTITIAL_STARTED,
          handleInterstitialStarted,
        );
      }
      if (hlsPlayer.Events.INTERSTITIALS_PRIMARY_RESUMED) {
        hlstag.off(
          hlsPlayer.Events.INTERSTITIALS_PRIMARY_RESUMED,
          handleInterstitialsPrimaryResumed,
        );
      }
      if (hlsPlayer.Events.INTERSTITIALS_UPDATED) {
        hlstag.off(
          hlsPlayer.Events.INTERSTITIALS_UPDATED,
          handleInterstitialsUpdated,
        );
      }
      if (hlsPlayer.Events.ASSET_LIST_LOADING) {
        hlstag.off(hlsPlayer.Events.ASSET_LIST_LOADING, handleAssetListLoading);
      }
      if (hlsPlayer.Events.ASSET_LIST_LOADED) {
        hlstag.off(hlsPlayer.Events.ASSET_LIST_LOADED, handleAssetListLoaded);
      }
      if (hlsPlayer.Events.INTERSTITIAL_ASSET_ENDED) {
        hlstag.off(
          hlsPlayer.Events.INTERSTITIAL_ASSET_ENDED,
          handleInterstitialAssetEnded,
        );
      }
      if (hlsPlayer.Events.INTERSTITIAL_ENDED) {
        hlstag.off(
          hlsPlayer.Events.INTERSTITIAL_ENDED,
          handleInterstitialEnded,
        );
      }
      if (hlsPlayer.Events.INTERSTITIAL_ASSET_STARTED) {
        hlstag.off(
          hlsPlayer.Events.INTERSTITIAL_ASSET_STARTED,
          handleInterstitialAssetStarted,
        );
      }
      if (hlsPlayer.Events.INTERSTITIAL_ASSET_ERROR) {
        hlstag.off(
          hlsPlayer.Events.INTERSTITIAL_ASSET_ERROR,
          handleInterstitialAssetError,
        );
      }
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

  if (hlsPlayer.Events.INTERSTITIAL_STARTED) {
    hlstag.on(hlsPlayer.Events.INTERSTITIAL_STARTED, handleInterstitialStarted);
  }

  if (hlsPlayer.Events.INTERSTITIALS_PRIMARY_RESUMED) {
    hlstag.on(
      hlsPlayer.Events.INTERSTITIALS_PRIMARY_RESUMED,
      handleInterstitialsPrimaryResumed,
    );
  }

  if (hlsPlayer.Events.INTERSTITIALS_UPDATED) {
    hlstag.on(
      hlsPlayer.Events.INTERSTITIALS_UPDATED,
      handleInterstitialsUpdated,
    );
  }

  if (hlsPlayer.Events.ASSET_LIST_LOADING) {
    hlstag.on(hlsPlayer.Events.ASSET_LIST_LOADING, handleAssetListLoading);
  }

  if (hlsPlayer.Events.ASSET_LIST_LOADED) {
    hlstag.on(hlsPlayer.Events.ASSET_LIST_LOADED, handleAssetListLoaded);
  }

  if (hlsPlayer.Events.INTERSTITIAL_ASSET_ENDED) {
    hlstag.on(
      hlsPlayer.Events.INTERSTITIAL_ASSET_ENDED,
      handleInterstitialAssetEnded,
    );
  }

  if (hlsPlayer.Events.INTERSTITIAL_ENDED) {
    hlstag.on(hlsPlayer.Events.INTERSTITIAL_ENDED, handleInterstitialEnded);
  }

  if (hlsPlayer.Events.INTERSTITIAL_ASSET_STARTED) {
    hlstag.on(
      hlsPlayer.Events.INTERSTITIAL_ASSET_STARTED,
      handleInterstitialAssetStarted,
    );
  }

  if (hlsPlayer.Events.INTERSTITIAL_ASSET_ERROR) {
    hlstag.on(
      hlsPlayer.Events.INTERSTITIAL_ASSET_ERROR,
      handleInterstitialAssetError,
    );
  }

  hlstag.on(
    hlsPlayer.Events.DESTROYING,
    videoContainer.fp?.destroyHlsMonitoring,
  );
};
