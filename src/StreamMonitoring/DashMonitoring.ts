import {
  getHostName,
  parseCmcdPayload,
  buildRenditionName,
} from "../CommonMethods/index";

interface DashJsOptions {
  requestEndDate: DateLike;
  requestStartDate: DateLike;
  endDate: DateLike;
  startDate: DateLike;
  firstByteDate: DateLike;
  url: string;
  bytesLoaded: any;
  mediaType: any;
}

interface MediaData {
  bitrate: number;
  width?: number;
  height?: number;
  codec?: string;
  mimeType?: string;
}

interface MediaEvent {
  mediaType?: "video" | "audio";
  newRepresentation?: {
    bandwidth: number;
    height: number;
    width: number;
    codecs: string;
    frameRate?: string | number;
    mimeType?: string;
  };
  newQuality?: number;
}

type DateLike = string | number | Date;

const frameRateOf = (rate: string | number | undefined): number | undefined => {
  const [numerator, denominator] = String(rate ?? "").split("/");
  return (
    Number(numerator) / (denominator ? Number(denominator) : 1) || undefined
  );
};

export const setupDashMonitoring = (
  dashTag: any,
  videoContainer: any,
  errorTracking: any,
  dispatchEvent: (type: string, data: any) => void,
) => {
  const headerAllowlist = new Set([
    "x-cdn",
    "content-type",
    "content-length",
    "last-modified",
    "server",
    "x-request-id",
    "cf-ray",
    "x-amz-cf-id",
    "x-akamai-request-id",
  ]);

  function removeClass(rawHeaders: string = ""): Record<string, string> {
    const headerMap: Record<string, string> = {};

    rawHeaders
      .trim()
      .split(/[\r\n]+/)
      .forEach((line) => {
        if (!line) return;

        const [headerName, ...rest] = line.split(": ");
        if (!headerName) return;

        const headerKey = headerName.toLowerCase();
        const headerValue = rest.join(": ");

        const isWhitelisted =
          headerAllowlist.has(headerKey) || headerKey.startsWith("x-litix-");

        if (isWhitelisted) {
          headerMap[headerName] = headerValue;
        }
      });

    return headerMap;
  }

  const extractRequestMetrics = (
    options: DashJsOptions,
    player: {
      getMetricsFor: (type: any) => { HttpList: any };
      getDashMetrics: () => { getHttpRequests: (type: any) => any };
    },
  ) => {
    if (!(options?.endDate ?? options?.requestEndDate)) return {};

    const {
      url,
      bytesLoaded,
      requestStartDate,
      requestEndDate,
      startDate,
      firstByteDate,
      endDate,
      mediaType,
    } = options;

    const requestHostname = getHostName(url);
    const requestStart = new Date(startDate ?? requestStartDate).getTime();
    const requestResponseStart = new Date(firstByteDate).getTime();
    const requestResponseEnd = new Date(endDate ?? requestEndDate).getTime();

    const httpRequests =
      typeof player.getMetricsFor === "function"
        ? player.getMetricsFor(mediaType).HttpList
        : player.getDashMetrics().getHttpRequests(mediaType);

    const lastRequest = httpRequests?.[httpRequests.length - 1];
    const responseHeaders = lastRequest
      ? removeClass(lastRequest._responseHeaders ?? "")
      : undefined;

    return {
      requestStart,
      requestResponseStart,
      requestResponseEnd,
      requestBytesLoaded: bytesLoaded,
      requestResponseHeaders: responseHeaders,
      requestHostname,
      requestUrl: url,
      requestCmcd: parseCmcdPayload(url),
    };
  };

  const sendRequestEvent = (
    eventType: string,
    metrics: ReturnType<typeof extractRequestMetrics>,
    requestType: string,
  ) => {
    dispatchEvent("requestCompleted", {
      request_event_type: eventType,
      request_start: metrics.requestStart,
      request_response_start: metrics.requestResponseStart,
      request_response_end: metrics.requestResponseEnd,
      request_bytes_loaded: metrics.requestBytesLoaded ?? -1,
      request_type: requestType,
      request_response_headers: metrics.requestResponseHeaders,
      request_hostname: metrics.requestHostname,
      request_url: metrics.requestUrl,
      ...("requestCmcd" in metrics ? metrics.requestCmcd : undefined),
    });
  };

  const getManifestMimeType = () => {
    const httpRequests = dashTag.getDashMetrics().getHttpRequests("Manifest");
    const manifestRequest = httpRequests[httpRequests.length - 1];
    if (manifestRequest?._responseHeaders) {
      const headers = manifestRequest._responseHeaders.split("\n");
      const contentType = headers
        .find((header: string) =>
          header.toLowerCase().startsWith("content-type:"),
        )
        ?.split(":")[1]
        ?.trim();
      return contentType;
    }
    return undefined;
  };

  const handleManifestLoaded = (event: {
    type: string;
    data: { url: string };
  }) => {
    const { type, data } = event;
    const url = data?.url;
    const manifestMimeType = getManifestMimeType();

    const metrics = {
      requestStart: 0,
      requestResponseStart: 0,
      requestResponseEnd: 0,
      requestBytesLoaded: -1,
      requestResponseHeaders: undefined,
      requestHostname: getHostName(url),
      requestUrl: url,
      requestCmcd: parseCmcdPayload(url),
      request_mime_type: manifestMimeType,
    };

    sendRequestEvent(type, metrics, "manifest");
  };

  const handleInitFragmentV4 = (event: {
    type: string;
    request: any;
    chunk: any;
  }) => {
    const metrics = extractRequestMetrics(event.request, dashTag);
    const typeSuffix = `${event.chunk?.mediaInfo?.type}_init`;

    sendRequestEvent(event.type, metrics, typeSuffix);
  };

  const handleMediaFragmentV4 = (info: {
    type: string;
    request: any;
    chunk: any;
  }) => {
    const { type, request, chunk } = info;
    const mediaType = chunk?.mediaInfo?.type;
    const metrics = extractRequestMetrics(request, dashTag);
    sendRequestEvent(type, metrics, mediaType);
  };

  let mediaData: {
    video?: MediaData;
    audio?: MediaData;
    lastVideoBitrate?: number;
  } = {};

  // Extracts codec string from codec metadata
  const extractCodec = (codecLine: string): string | undefined => {
    const match = /codecs\*?="([^"]*)"/.exec(codecLine);
    return match ? match[1] : undefined;
  };

  // Resolves the bitrate of the audio rendition currently playing alongside the
  // video. Prefers the value already tracked from a quality change, and falls
  // back to asking dash.js, since a video switch can arrive before any audio
  // switch has been observed.
  const activeAudioBitrate = (): number => {
    const tracked = mediaData.audio?.bitrate;

    if (typeof tracked === "number") {
      return tracked;
    }

    try {
      // dash.js 5 removed getBitrateInfoListFor and getQualityFor in favour of
      // the representation API. Asking the old pair on a v5 player returns
      // nothing and this reported zero, which also left video_source_bitrate
      // video-only since the variant rate is the sum of the two.
      const current = dashTag.getCurrentRepresentationForType?.("audio");

      if (typeof current?.bandwidth === "number") {
        return current.bandwidth;
      }

      // dash.js 4 and earlier
      const quality = dashTag.getQualityFor?.("audio");
      const list = dashTag.getBitrateInfoListFor?.("audio") ?? [];
      const match = list.find(
        (item: { qualityIndex: number }) => item.qualityIndex === quality,
      );

      return typeof match?.bitrate === "number" ? match.bitrate : 0;
    } catch {
      // getCurrentRepresentationForType throws before streaming is initialised
      return 0;
    }
  };

  // The codec of the audio rendition playing alongside the video, resolved the
  // same way as its bitrate. Without this the audio codec is written only by
  // parseMediaData, which runs on an audio quality change - so a stream with a
  // single audio rendition, which is most of them, never reported one at all.
  const activeAudioCodec = (): string | undefined => {
    const tracked = mediaData.audio?.codec;

    if (tracked) {
      return extractCodec(tracked);
    }

    try {
      // A track reports the full mime string, so the codec is parsed out of it.
      // A representation reports the bare codec already, so it is taken as is.
      const fromTrack = extractCodec(
        dashTag.getCurrentTrackFor?.("audio")?.codec ?? "",
      );

      if (fromTrack) {
        return fromTrack;
      }

      const codecs = dashTag.getCurrentRepresentationForType?.("audio")?.codecs;

      return typeof codecs === "string" && codecs !== "" ? codecs : undefined;
    } catch {
      return undefined;
    }
  };

  // video_source_bitrate is the peak rate of the whole variant, inclusive of the
  // audio played with it - the same meaning EXT-X-STREAM-INF:BANDWIDTH carries on
  // the HLS path. An MPD declares video and audio separately, so the two are
  // summed. When the audio rate is not yet known the video rate stands alone,
  // since a small undercount beats an absent field.
  const variantBitrate = (videoBitrate: number): number =>
    videoBitrate + activeAudioBitrate();

  // Parses collected bitrate and codec data. The change check stays on the video
  // rate so an audio switch alone is not reported as a rendition change.
  const parseMediaData = () => {
    const { video, audio, lastVideoBitrate } = mediaData;

    if (video && typeof video.bitrate === "number") {
      if (!video.width || !video.height) {
        return;
      }

      if (video.bitrate !== lastVideoBitrate) {
        mediaData.lastVideoBitrate = video.bitrate;

        return {
          video_source_bitrate: variantBitrate(video.bitrate),
          video_source_height: video.height,
          video_source_width: video.width,
          video_source_codec: extractCodec(video.codec ?? ""),
          video_source_audio_codec: extractCodec(audio?.codec ?? ""),
          video_source_audio_bitrate: audio?.bitrate,
          video_source_rendition_name: buildRenditionName(
            video.width,
            video.height,
          ),
        };
      }
    }
  };

  // Handles playback quality change event
  const handleQualityChange = (event: MediaEvent) => {
    const { mediaType, newRepresentation, newQuality } = event;

    if (mediaType === "video" && typeof newRepresentation === "object") {
      videoContainer?.fp?.dispatch("variantChanged", {
        video_source_bitrate: variantBitrate(
          Number(newRepresentation.bandwidth) || 0,
        ),
        video_source_height: newRepresentation.height,
        video_source_width: newRepresentation.width,
        video_source_codec: newRepresentation.codecs,
        // Split before dividing because an MPD declares frame rate as a ratio
        // such as "30000/1001" - parseFloat alone would read that as 30000
        video_source_fps: frameRateOf(newRepresentation.frameRate),
        // Carried here as well as in parseMediaData, so a stream whose audio
        // never switches still describes the audio it is playing.
        video_source_audio_codec: activeAudioCodec(),
        video_source_audio_bitrate: activeAudioBitrate() || undefined,
        video_source_rendition_name: buildRenditionName(
          newRepresentation.width,
          newRepresentation.height,
        ),
      });
      return;
    }

    if (
      typeof newQuality === "number" &&
      (mediaType === "video" || mediaType === "audio")
    ) {
      const bitrateList = dashTag.getBitrateInfoListFor(mediaType);
      const matchedBitrate = bitrateList.find(
        (item: { qualityIndex: number }) => item.qualityIndex === newQuality,
      );

      if (!matchedBitrate || typeof matchedBitrate.bitrate !== "number") {
        return;
      }

      mediaData[mediaType] = {
        ...matchedBitrate,
        codec: dashTag.getCurrentTrackFor(mediaType)?.codec,
      };

      const bitrateData = parseMediaData();
      if (bitrateData) {
        videoContainer?.fp?.dispatch("variantChanged", bitrateData);
      }
    }
  };

  const handleCanceledRequest = (event: any) => {
    const mediaRequest = event.request;
    const mediaType = event.mediaType;
    const eventType = mediaRequest?.action;
    const requesturl = mediaRequest?.url;
    const requestHostName = requesturl ? getHostName(requesturl) : "";

    videoContainer?.fp?.dispatch("requestCanceled", {
      request_event_type: eventType,
      request_url: requesturl,
      request_type: mediaType,
      request_hostname: requestHostName,
    });
  };

  const handleErrorEvent = function (self: { emit?: any; error?: any }) {
    let errorContext = "";
    const { error } = self;

    if (!error) return;

    const { data } = error;
    const options = data?.request ?? {};
    const key = data?.response ?? {};

    if (error.code === 27) {
      videoContainer?.fp.dispatch("requestFailed", {
        request_error: `${options.type}_${options.action}`,
        request_url: options.url,
        request_hostname: options.url ? getHostName(options.url) : "",
        request_type: options.mediaType,
        request_error_code: key.status,
        request_error_text: key.statusText,
      });
    }

    if (options.url) {
      errorContext += "url: " + options.url + "\n";
    }

    if (key.status || key.statusText) {
      const status = key.status ?? "";
      const statusText = key.statusText ?? "";
      errorContext += "response: " + status + ", " + statusText + "\n";
    }

    // An ad failing is not the content failing. Reporting it as a playback
    // error would set view_playback_failed for a view whose content played
    // perfectly well, and would stop content metric collection for the rest of
    // it. openBreak is only set while an ad period is on screen.
    if (openBreak) {
      // The response status where the ad's media failed to load, since that
      // says what the ad server actually did, falling back to dash.js's own
      // code for failures with no HTTP exchange behind them. Reported as a
      // string because the HLS path reports a symbolic detail here, and
      // view_ad_error_source is what makes either interpretable. Left absent
      // rather than empty when neither is available.
      const adErrorCode = key.status ?? error.code;

      dispatchEvent("aderror", {
        view_ad_break_id: openBreak.id,
        view_ad_error_message: error.message,
        view_ad_error_source: "dash-period",
        view_ad_error_code:
          adErrorCode === undefined || adErrorCode === null
            ? undefined
            : String(adErrorCode),
      });

      return;
    }

    // dash.js surfaces no severity flag, and only reaches here for errors that
    // stop playback, so everything reported from this path is treated as fatal.
    if (errorTracking?.automaticErrorTracking) {
      videoContainer?.fp.dispatch("error", {
        player_error_code: error.code,
        player_error_message: error.message,
        player_error_context: errorContext,
        player_error_severity: "fatal",
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Ad tracking - DASH-IF multi-period SSAI
  //
  // Ad media lives in its own Period, told apart from content by the
  // AssetIdentifier descriptor. Unlike HLS interstitials, those periods sit
  // inside the presentation timeline, so every offset reported here is converted
  // back to content time before it leaves.
  // ---------------------------------------------------------------------------

  // Ad interpretation must never reach dash.js. A manifest shape we did not
  // anticipate should cost the ad fields and nothing else.
  const adGuard =
    (handler: (...args: any[]) => void) =>
    (...args: any[]) => {
      try {
        handler(...args);
      } catch {}
    };

  // Two spellings of the same descriptor are in the wild: the one in the MPEG
  // base standard and the one the DASH-IF guidelines use, which is what the
  // DASH-IF ad insertion conformance streams actually carry. Matching only the
  // first reports no ad breaks on those streams, silently.
  const ASSET_ID_SCHEMES = new Set([
    "urn:mpeg:dash:asset-id:2013",
    "urn:org:dashif:asset-id:2013",
  ]);

  interface AdAsset {
    periodId: string;
    assetId?: string;
    durationMs?: number;
    hostname?: string;
    index: number;
  }

  interface AdBreak {
    id: string;
    position: "preroll" | "midroll" | "postroll";
    durationMs: number;
    timeOffsetMs: number;
    assets: AdAsset[];
  }

  let contentAssetId: string | undefined;
  let breaksByPeriod: Map<string, AdBreak> | undefined;
  let assetsByPeriod: Map<string, AdAsset> | undefined;
  let openBreak: AdBreak | undefined;
  let openAsset: AdAsset | undefined;
  let lastPeriodId: string | undefined;

  // Where the break sits relative to the content. A break with no content
  // before it is a preroll however the manifest ordered the periods, and one
  // with no content after it is a postroll.
  const breakPositionOf = (
    contentElapsedS: number,
    contentFollows: boolean,
  ): "preroll" | "midroll" | "postroll" => {
    if (contentElapsedS === 0) {
      return "preroll";
    }

    return contentFollows ? "midroll" : "postroll";
  };

  const asArray = (value: any): any[] => {
    if (value === undefined || value === null) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  };

  // dash.js normalises most attributes, but the raw parse can still carry the
  // "@" prefixed form and an unconverted ISO 8601 duration.
  const attrOf = (node: any, name: string): any =>
    node?.[name] ?? node?.["@" + name];

  const secondsOf = (value: any): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    // Each unit is matched as a loose run of digits and dots rather than a
    // strict decimal, which keeps the pattern readable. That admits shapes like
    // "1.2.3", so the total is checked for finiteness below - Number() turns
    // those into NaN and they are rejected exactly as the stricter pattern did.
    const match = /^PT(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/.exec(
      String(value ?? ""),
    );

    if (!match) {
      return undefined;
    }

    const total =
      Number(match[1] ?? 0) * 3600 +
      Number(match[2] ?? 0) * 60 +
      Number(match[3] ?? 0);

    return Number.isFinite(total) ? total : undefined;
  };

  const assetIdOf = (period: any): string | undefined => {
    const descriptors = asArray(
      period?.AssetIdentifier_asArray ?? period?.AssetIdentifier,
    );
    const match = descriptors.find((item) =>
      ASSET_ID_SCHEMES.has(String(attrOf(item, "schemeIdUri"))),
    );
    const value = attrOf(match, "value");

    return typeof value === "string" && value !== "" ? value : undefined;
  };

  // The content asset is the one accounting for the greatest total duration,
  // never the first period. A preroll leads the presentation whenever one is
  // present, and anchoring on periods[0] would report every ad as content and
  // the content as an ad - the feature inverted for the whole session.
  const resolveContentAssetId = (
    periods: { assetId?: string; durationS: number }[],
  ): string | undefined => {
    const totals = new Map<string, number>();

    periods.forEach(({ assetId, durationS }) => {
      if (assetId) {
        totals.set(assetId, (totals.get(assetId) ?? 0) + durationS);
      }
    });

    let winner: string | undefined;
    let best = -1;

    totals.forEach((total, assetId) => {
      if (total > best) {
        best = total;
        winner = assetId;
      }
    });

    return winner;
  };

  // A BaseURL entry parses as either a bare string or a node carrying the text,
  // depending on how the manifest was written. Only the first is read: several
  // at one level are alternates of the same content, so they share a host in
  // every case worth reporting.
  const baseUrlOf = (node: any): string | undefined => {
    const entry = asArray(node?.BaseURL_asArray ?? node?.BaseURL)[0];
    const text = entry?.__text ?? entry;

    return typeof text === "string" && text !== "" ? text : undefined;
  };

  // Where the ad's media is actually served from. A period may carry its own
  // BaseURL, which is how a stitcher points one break at an ad server; when it
  // does not, the ad comes from the same host as the content and reporting that
  // host is still the truthful answer rather than a blank.
  const hostnameOf = (period: any, manifest: any): string | undefined => {
    const manifestBase = attrOf(manifest, "baseUri") ?? attrOf(manifest, "url");
    const candidate = baseUrlOf(period) ?? baseUrlOf(manifest) ?? manifestBase;

    if (typeof candidate !== "string" || candidate === "") {
      return undefined;
    }

    try {
      const absolute =
        typeof manifestBase === "string" && manifestBase !== ""
          ? new URL(candidate, manifestBase).href
          : candidate;

      return getHostName(absolute);
    } catch {
      // A base we cannot resolve costs this one field, not the schedule
      return undefined;
    }
  };

  const buildAdSchedule = (manifest: any) => {
    const rawPeriods = asArray(manifest?.Period_asArray ?? manifest?.Period);

    if (rawPeriods.length < 2) {
      return;
    }

    const periods = rawPeriods.map((period: any, index: number) => ({
      id: String(attrOf(period, "id") ?? `period-${index}`),
      assetId: assetIdOf(period),
      durationS: secondsOf(attrOf(period, "duration")) ?? 0,
      hostname: hostnameOf(period, manifest),
    }));

    // No descriptor anywhere means ad periods cannot be told from content ones.
    // Guessing from durations or URL shapes would invent ad breaks, so the
    // honest answer is to report none.
    if (!periods.some((period) => period.assetId)) {
      return;
    }

    contentAssetId = resolveContentAssetId(periods);

    if (!contentAssetId) {
      return;
    }

    breaksByPeriod = new Map();
    assetsByPeriod = new Map();

    // Content elapsed so far, which is what view_ad_time_offset reports. The
    // period's own presentation time includes every earlier ad, so a midroll
    // after a fifteen second preroll would read 75s where the viewer saw it at
    // 60s - and the same break on HLS would report 60s.
    let contentElapsedS = 0;
    let current: AdBreak | undefined;
    const contentFollows = periods.map((_, index) =>
      periods
        .slice(index + 1)
        .some((period) => period.assetId === contentAssetId),
    );

    periods.forEach((period, index) => {
      if (period.assetId === contentAssetId) {
        contentElapsedS += period.durationS;
        current = undefined;
        return;
      }

      // Consecutive non-content periods are one break containing several ads,
      // which is how a pod is expressed.
      if (!current) {
        current = {
          id: period.id,
          position: breakPositionOf(contentElapsedS, contentFollows[index]),
          durationMs: 0,
          timeOffsetMs: Math.round(1e3 * contentElapsedS),
          assets: [],
        };
      }

      const asset: AdAsset = {
        periodId: period.id,
        assetId: period.assetId,
        durationMs:
          period.durationS > 0 ? Math.round(1e3 * period.durationS) : undefined,
        hostname: period.hostname,
        index: current.assets.length,
      };

      current.assets.push(asset);
      current.durationMs += asset.durationMs ?? 0;
      breaksByPeriod!.set(period.id, current);
      assetsByPeriod!.set(period.id, asset);
    });

    const firstBreak = breaksByPeriod.get(periods[0].id);

    // The schedule is known before playback reaches any of it, so a preroll can
    // be reported as scheduled whether or not it ends up playing.
    if (firstBreak?.position === "preroll") {
      dispatchEvent("prerollScheduled", {});
      dispatchEvent("prerollRequested", {});
    }
  };

  const closeOpenBreak = () => {
    if (!openBreak) {
      return;
    }

    if (openAsset) {
      dispatchEvent("adended", {
        view_ad_break_id: openBreak.id,
        view_ad_asset_id: openAsset.assetId,
        view_ad_asset_index: openAsset.index,
      });
      openAsset = undefined;
    }

    dispatchEvent("adbreakend", {
      view_ad_duration:
        openBreak.durationMs > 0 ? openBreak.durationMs : undefined,
    });
    openBreak = undefined;
  };

  const enterPeriod = (periodId: string) => {
    if (!breaksByPeriod || !assetsByPeriod || periodId === lastPeriodId) {
      return;
    }

    lastPeriodId = periodId;

    const nextBreak = breaksByPeriod.get(periodId);

    if (!nextBreak) {
      closeOpenBreak();
      return;
    }

    if (nextBreak !== openBreak) {
      closeOpenBreak();
      openBreak = nextBreak;

      dispatchEvent("adbreakstart", {
        view_ad_break_id: nextBreak.id,
        view_ad_break_position: nextBreak.position,
        view_ad_duration:
          nextBreak.durationMs > 0 ? nextBreak.durationMs : undefined,
        view_ad_time_offset: nextBreak.timeOffsetMs,
        view_ad_system: undefined,
        // Carried on the break as well as the asset: view_preroll_asset_hostname
        // is derived from what adbreakstart reports, not from adplay.
        view_ad_asset_hostname: nextBreak.assets[0]?.hostname,
      });
    } else if (openAsset) {
      // Next ad in the same pod
      dispatchEvent("adended", {
        view_ad_break_id: nextBreak.id,
        view_ad_asset_id: openAsset.assetId,
        view_ad_asset_index: openAsset.index,
      });
    }

    openAsset = assetsByPeriod.get(periodId);

    // adplay, not adplaying. Reaching the period says the player got here, not
    // that a frame rendered. The impression is derived in nucleusState from the
    // media element reporting playback, exactly as on the HLS path.
    dispatchEvent("adplay", {
      view_ad_break_id: nextBreak.id,
      view_ad_asset_id: openAsset?.assetId,
      view_ad_asset_index: openAsset?.index,
      view_ad_asset_duration: openAsset?.durationMs,
      view_ad_asset_hostname: openAsset?.hostname,
    });
  };

  const handleManifestForAds = adGuard((event: any) => {
    // A new manifest is a new schedule
    contentAssetId = undefined;
    breaksByPeriod = undefined;
    assetsByPeriod = undefined;
    openBreak = undefined;
    openAsset = undefined;
    lastPeriodId = undefined;

    buildAdSchedule(event?.data);
  });

  const currentPeriodId = (): string | undefined => {
    const info = dashTag.getActiveStream?.()?.getStreamInfo?.();
    const id = info?.id;

    return id === undefined || id === null ? undefined : String(id);
  };

  // dash.js has renamed period transitions across major versions, so both names
  // are bound and enterPeriod ignores a repeat of the period it already saw.
  const handlePeriodSwitch = adGuard(() => {
    const periodId = currentPeriodId();

    if (periodId !== undefined) {
      enterPeriod(periodId);
    }
  });

  if (videoContainer?.fp) {
    videoContainer.fp.destroyDashMonitoring = () => {
      dashTag.off("manifestLoaded", handleManifestForAds);
      dashTag.off("periodSwitchCompleted", handlePeriodSwitch);
      dashTag.off("streamActivated", handlePeriodSwitch);
      dashTag.off("error", handleErrorEvent);
      dashTag.off("fragmentLoadingAbandoned", handleCanceledRequest);
      dashTag.off("qualityChangeRendered", handleQualityChange);
      dashTag.off("manifestLoaded", handleManifestLoaded);
      dashTag.off("initFragmentLoaded", handleInitFragmentV4);
      dashTag.off("mediaFragmentLoaded", handleMediaFragmentV4);
      delete videoContainer.fp?.destroyDashMonitoring;
    };
  }

  dashTag.on("error", handleErrorEvent);
  dashTag.on("fragmentLoadingAbandoned", handleCanceledRequest);
  dashTag.on("qualityChangeRendered", handleQualityChange);
  dashTag.on("manifestLoaded", handleManifestLoaded);
  dashTag.on("initFragmentLoaded", handleInitFragmentV4);
  dashTag.on("mediaFragmentLoaded", handleMediaFragmentV4);
  dashTag.on("manifestLoaded", handleManifestForAds);
  dashTag.on("periodSwitchCompleted", handlePeriodSwitch);
  dashTag.on("streamActivated", handlePeriodSwitch);
};
