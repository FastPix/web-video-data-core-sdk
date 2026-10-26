import type { ActionableDataTypes } from "../DataType/index";

import {
  buildUUID,
  generateIdToken,
  generateRandomIdentifier,
} from "../IdGenerationMethod/index";

// Return Host & Domain Name
const getHostAndDomainName = (endpoint: string): [string, string] => {
  if (!endpoint) {
    return ["localhost", "localhost"];
  }
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    const parts = host.split(".");
    const domain = parts.length >= 2 ? parts.slice(-2).join(".") : host;
    return [host, domain];
  } catch {}

  return ["localhost", "localhost"];
};

// Return Hostname
const getHostName = (obj: string): string | undefined => {
  return getHostAndDomainName(obj)[0];
};

// Return Domain Name
const getDomainName = (obj: string): string | undefined => {
  return getHostAndDomainName(obj)[1];
};

// Get or generate unique element ID
const getElementId = (attr: HTMLElement | string): string | undefined => {
  if (attr && (attr as HTMLElement).nodeName) {
    return (
      (attr as HTMLElement as any).uniqueId ??
      ((attr as HTMLElement as any).uniqueId = generateIdToken())
    );
  }

  try {
    const element = document.querySelector(
      attr as string,
    ) as HTMLElement as any;

    if (element && !element.uniqueId) {
      element.uniqueId = attr as string;
    }

    return element?.uniqueId ?? (attr as string);
  } catch {}

  return attr as string;
};

// Analyze video element
const analyzeVideo = (
  target: HTMLElement | string | undefined,
): [HTMLElement | null, string | undefined, string] => {
  let videoTag: HTMLElement | null = null;
  if (target && (target as HTMLElement).nodeName !== undefined) {
    videoTag = target as HTMLElement;
    target = getElementId(videoTag);
  } else {
    videoTag = document.querySelector(target as string) as HTMLElement;
  }
  const failureMessage = videoTag?.nodeName?.toLowerCase() || "";

  return [videoTag, target as string, failureMessage];
};

// Identify or assign unique ID to an element
const identifyElement = (target: HTMLElement | string): string | undefined => {
  let foundElement: Element | null = null;

  if (target && (target as HTMLElement).nodeName !== undefined) {
    return (
      (target as HTMLElement as any).elementId ??
        ((target as HTMLElement as any).elementId = generateRandomIdentifier()),
      (target as HTMLElement as any).elementId
    );
  }

  try {
    foundElement = document.querySelector(target as string);
  } catch {}

  if (foundElement && !(foundElement as any).elementId) {
    (foundElement as any).elementId = target as string;
  }

  return (foundElement as any)?.elementId ?? (target as string);
};

// Merge multiple objects, skipping undefined values
function mergeObjects<T extends object>(...objects: T[]): T {
  return objects.reduce((merged, obj) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        merged[key as keyof T] = value as T[keyof T];
      }
    }
    return merged;
  }, {} as T);
}

// Increment a metric in a target object
function metricUpdation(
  targetObject: Record<string, number>,
  eventName: string,
  incrementValue: number = 1,
): void {
  targetObject[eventName] = (targetObject[eventName] ?? 0) + incrementValue;
}

// Formulate beacon URL
function formulateBeaconUrl(
  workspace: string,
  config: ActionableDataTypes,
): string {
  const { beaconDomain } = config;
  const targetDomain = beaconDomain ?? "anlytix.io";
  const finalWorkspace = workspace ?? "collector";

  return `https://${finalWorkspace}.${targetDomain}`;
}

// Check if Do Not Track is enabled
function checkDoNotTrack(): boolean {
  const dntStatus =
    navigator.doNotTrack ??
    (window as any).doNotTrack ??
    (navigator as any).msDoNotTrack;

  return dntStatus === "1" || dntStatus === "yes";
}

class ListenerManager {
  events: { [key: string]: Function[] } = {};

  on(eventName: string, callback: Function): void {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  off(eventName: string, callback: Function): void {
    if (this.events[eventName]) {
      this.events[eventName] = this.events[eventName].filter(
        (cb) => cb !== callback,
      );
    }
  }

  emit(eventName: string, data: any): void {
    if (this.events[eventName]) {
      this.events[eventName].forEach((callback) => {
        callback(data);
      });
    }
  }
}

const timestamp: {
  now: () => number;
} = {
  now: function () {
    return Date.now();
  },
};

// checks page dom start time
const customTimerModule = {
  isPerformanceAvailable: function () {
    const perf = (window as any).performance;
    return perf?.timing !== undefined;
  },

  getDomContentLoadedEnd: function () {
    const timing = (window as any).performance?.timing;
    return timing ? timing.domContentLoadedEventEnd : null;
  },

  getNavigationStartTime: function () {
    const timing = (window as any).performance?.timing;
    return timing ? timing.navigationStart : null;
  },
};

function getRequestTimingDetails(event: any) {
  if (!event) {
    return {};
  }

  const pageStartTime = customTimerModule.getNavigationStartTime();
  const { loading, trequest, tfirst, tload, total } = event;
  const reqStart = loading ? loading.start : trequest;
  const reqFirst = loading ? loading.first : tfirst;
  const reqLoad = loading ? loading.end : tload;

  return {
    bytesLoaded: total,
    requestStart: Math.round(pageStartTime + reqStart),
    responseStart: Math.round(pageStartTime + reqFirst),
    responseEnd: Math.round(pageStartTime + reqLoad),
  };
}

const fetchNetworkInformation = (): any => {
  const connectionType = navigator as any;

  return (
    connectionType?.connection ??
    connectionType?.mozConnection ??
    connectionType?.webkitConnection
  );
};

const checkNetworkBandwidth = (): string | undefined => {
  return fetchNetworkInformation()?.type;
};

// Chrome omits connection.type, so effectiveType is reported separately
const getNetworkSpeed = (): string | undefined => {
  return fetchNetworkInformation()?.effectiveType;
};

const getNetworkConnection = (): string | undefined => {
  switch (checkNetworkBandwidth()) {
    case "cellular":
      return "cellular";
    case "ethernet":
      return "wired";
    case "wifi":
      return "wifi";
    case undefined:
      break;
    default:
      return "other";
  }
};

// Returns the IANA timezone of the viewer
const getTimezoneName = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {}
};

// Narrows the screen orientation down to portrait or landscape
const getScreenOrientation = (): string | undefined => {
  const orientationType = (window as any)?.screen?.orientation?.type;

  if (typeof orientationType !== "string") {
    return;
  }

  return orientationType.startsWith("portrait") ? "portrait" : "landscape";
};

// CTA-5004 keys mapped onto beacon fields. Kept separate from the natively
// derived equivalents so the source of a value is never ambiguous - these are
// only ever populated when the player was configured to emit CMCD.
const cmcdKeyMappings: { [key: string]: string } = {
  bl: "request_cmcd_buffer_length",
  br: "request_cmcd_bitrate",
  bs: "request_cmcd_buffer_starvation",
  cid: "request_cmcd_content_id",
  d: "request_cmcd_object_duration",
  dl: "request_cmcd_deadline",
  mtp: "request_cmcd_throughput",
  nor: "request_cmcd_next_object",
  nrr: "request_cmcd_next_range",
  ot: "request_cmcd_object_type",
  pr: "request_cmcd_playback_rate",
  rtp: "request_cmcd_requested_throughput",
  sf: "request_cmcd_stream_format",
  sid: "request_cmcd_session_id",
  st: "request_cmcd_stream_type",
  su: "request_cmcd_startup",
  tb: "request_cmcd_max_bitrate",
  v: "request_cmcd_version",
};

// Reads the CMCD payload a player appends to its media requests. Only the query
// argument form is reachable - the header form is sent on the request itself,
// which a script on the page cannot read back.
const parseCmcdPayload = (
  url: string | undefined,
): { [key: string]: any } | undefined => {
  if (!url?.includes("CMCD=")) {
    return;
  }

  let payload: string | null = null;

  try {
    payload = new URL(url, window?.location?.href).searchParams.get("CMCD");
  } catch {
    return;
  }

  if (!payload) {
    return;
  }

  const parsed: { [key: string]: any } = {};

  // Split on commas outside quoted values, since a quoted value may contain one
  (payload.match(/(?:[^,"]|"[^"]*")+/g) ?? []).forEach((pair) => {
    const separator = pair.indexOf("=");
    const rawKey = (separator === -1 ? pair : pair.slice(0, separator)).trim();
    const field = cmcdKeyMappings[rawKey];

    if (!field) {
      return;
    }

    // A key with no value is a boolean that is present, per the spec
    if (separator === -1) {
      parsed[field] = true;
      return;
    }

    const rawValue = pair.slice(separator + 1).trim();

    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      parsed[field] = rawValue.slice(1, -1);
    } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      parsed[field] = Number(rawValue);
    } else {
      parsed[field] = rawValue;
    }
  });

  return Object.keys(parsed).length ? parsed : undefined;
};

// Builds a readable label for the rendition being played. Manifests rarely
// carry a NAME attribute, so the label is derived rather than read, which also
// keeps it consistent across packagers that spell their own labels differently.
//
// The short side is used because that is what a resolution is named after - a
// portrait clip at 1080x1920 is still 1080p, not 1920p.
const buildRenditionName = (
  width: number | undefined,
  height: number | undefined,
  dynamicRange?: string,
): string | undefined => {
  const shortSide = Math.min(width || 0, height || 0) || height;

  if (!shortSide) {
    return;
  }

  const tiers: [number, string][] = [
    [2160, "4K"],
    [1440, "QHD"],
    [1080, "FHD"],
    [720, "HD"],
  ];
  const tier = tiers.find(([threshold]) => shortSide >= threshold);
  const range = dynamicRange && dynamicRange !== "SDR" ? dynamicRange : "";

  return [shortSide + "p", tier?.[1], range].filter(Boolean).join(" ");
};

// Names the delivery protocol from the source URL. The path is inspected
// rather than the whole URL so a signature or token in the query string cannot
// be mistaken for a manifest extension.
const identifyStreamingProtocol = (
  url: string | undefined,
): string | undefined => {
  if (!url) {
    return;
  }

  let path = url;

  try {
    path = new URL(url, window?.location?.href).pathname;
  } catch {}

  if (path.includes(".m3u8")) {
    return "HLS";
  }

  if (path.includes(".mpd")) {
    return "DASH";
  }

  if (/\.(mp4|webm|ogv|mov|m4v)$/i.test(path)) {
    return "PROGRESSIVE";
  }
};

const headerRequests: string[] = [
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

function filterHeadersByAllowedList(
  headerString: string,
): Record<string, string> {
  const filteredHeaders: Record<string, string> = {};
  const allowedHeaders = new Set(
    headerRequests.map((header) => header.toLowerCase()),
  );

  if (!headerString || typeof headerString !== "string") {
    return {};
  }

  headerString
    .trim()
    .split(/[\r\n]+/)
    .forEach((headerLine) => {
      const [headerName, ...headerValueParts] = headerLine.split(": ");
      const headerValue = headerValueParts.join(": ");
      if (headerName && allowedHeaders.has(headerName.toLowerCase())) {
        filteredHeaders[headerName] = headerValue;
      }
    });

  return filteredHeaders;
}

// Returns request response headers
const fetchHeaders = function (reqargs: any) {
  if (reqargs && "function" == typeof reqargs.getAllResponseHeaders) {
    return filterHeadersByAllowedList(reqargs.getAllResponseHeaders());
  }
};

// utilityMethods to utilize in different functionalities
const utilityMethods = {
  convertSecToMs: function (seconds: number) {
    return Math.floor(1e3 * seconds);
  },
  isolateHostAndDomainName: getHostAndDomainName,
  fetchDomain: getDomainName,
  fetchHost: getHostName,
  generateIdToken: generateIdToken,
  buildUUID: buildUUID,
  now: timestamp.now,
};

export {
  getHostAndDomainName,
  getDomainName,
  getHostName,
  analyzeVideo,
  identifyElement,
  metricUpdation,
  formulateBeaconUrl,
  mergeObjects,
  checkDoNotTrack,
  getNetworkConnection,
  getNetworkSpeed,
  getTimezoneName,
  getScreenOrientation,
  ListenerManager,
  timestamp,
  customTimerModule,
  utilityMethods,
  getRequestTimingDetails,
  fetchHeaders,
  identifyStreamingProtocol,
  buildRenditionName,
  parseCmcdPayload,
};
