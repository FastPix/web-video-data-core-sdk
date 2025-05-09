import { getHostName } from "../CommonMethods/index";

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
    mimeType?: string;
  };
  newQuality?: number;
}

type DateLike = string | number | Date;

export const setupDashMonitoring = (
  dashTag: any,
  videoContainer: any,
  errorTracking: any,
  dispatchEvent: (type: string, data: any) => void,
) => {
  const headerAllowlist = [
    "x-cdn",
    "content-type",
    "content-length",
    "last-modified",
    "server",
    "x-request-id",
    "cf-ray",
    "x-amz-cf-id",
    "x-akamai-request-id",
  ];

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
          headerAllowlist.includes(headerKey) ||
          headerKey.startsWith("x-litix-");

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
    totalBitrate?: number;
  } = {};

  // Extracts codec string from codec metadata
  const extractCodec = (codecLine: string): string | undefined => {
    const match = /.*codecs\*?="(.*)"/.exec(codecLine);
    return match ? match[1] : undefined;
  };

  // Parses collected bitrate and codec data
  const parseMediaData = () => {
    const { video, audio, totalBitrate } = mediaData;

    if (video && typeof video.bitrate === "number") {
      if (!video.width || !video.height) {
        return;
      }

      let computedBitrate = video.bitrate;

      if (audio && typeof audio.bitrate === "number") {
        computedBitrate += audio.bitrate;
      }

      if (computedBitrate !== totalBitrate) {
        mediaData.totalBitrate = computedBitrate;

        return {
          video_source_bitrate: computedBitrate,
          video_source_height: video.height,
          video_source_width: video.width,
          video_source_codec: extractCodec(video.codec ?? ""),
        };
      }
    }
  };

  // Handles playback quality change event
  const handleQualityChange = (event: MediaEvent) => {
    const { mediaType, newRepresentation, newQuality } = event;

    if (mediaType === "video" && typeof newRepresentation === "object") {
      videoContainer?.fp?.dispatch("variantChanged", {
        video_source_bitrate: newRepresentation.bandwidth,
        video_source_height: newRepresentation.height,
        video_source_width: newRepresentation.width,
        video_source_codec: newRepresentation.codecs,
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

    if (errorTracking?.automaticErrorTracking) {
      videoContainer?.fp.dispatch("error", {
        player_error_code: error.code,
        player_error_message: error.message,
        player_error_context: errorContext,
      });
    }
  };

  if (videoContainer?.fp) {
    videoContainer.fp.destroyDashMonitoring = () => {
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
};
