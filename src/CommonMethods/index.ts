import type { ActionableDataTypes } from "../DataType/index";

import {
  buildUUID,
  generateIdToken,
  generateRandomIdentifier,
} from "../IdGenerationMethod/index";

// Return Host & Domain Name
const getHostAndDomainName = (endpoint: string): (string | undefined)[] => {
  if (typeof endpoint !== "string" || endpoint === "") {
    return ["localhost"];
  }
  let trackDomain: string | undefined;
  const trackHost: string | undefined = (endpoint.match(
    /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/,
  ) || [])[4];

  if (trackHost) {
    trackDomain = (trackHost.match(/[^.]+\.[^.]+$/) || [])[0];
  }

  return [trackHost, trackDomain];
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
      (attr as HTMLElement as any).uniqueId ||
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

    return element?.uniqueId || (attr as string);
  } catch (e) {
    return attr as string;
  }
};

// Analyze video element
const analyzeVideo = (
  target: HTMLElement | string | any,
): [HTMLElement | null, string | undefined, string] => {
  let videoTag: HTMLElement | null = null;
  if (target && (target as HTMLElement).nodeName !== undefined) {
    target = getElementId((videoTag = target as HTMLElement));
  } else {
    videoTag = document.querySelector(target as string) as HTMLElement;
  }
  const failureMessage = videoTag?.nodeName?.toLowerCase() || "";

  return [videoTag, target as string, failureMessage];
};

// Identify or assign unique ID to an element
const identifyElement = (target: HTMLElement | string): string | undefined => {
  let foundElement: Element | any = null;

  if (target && (target as HTMLElement).nodeName !== undefined) {
    return (
      (target as HTMLElement as any).elementId ||
        ((target as HTMLElement as any).elementId = generateRandomIdentifier()),
      (target as HTMLElement as any).elementId
    );
  }

  try {
    foundElement = document.querySelector(target as string);
  } catch {}

  if (foundElement && !foundElement.elementId) {
    foundElement.elementId = target as string;
  }

  return foundElement?.elementId || (target as string);
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
  const targetDomain = beaconDomain || "metrix.ws";
  const finalWorkspace = workspace || "collector";

  if (config?.actionableData?.beaconCollectionDomain) {
    return `https://${config.actionableData.beaconCollectionDomain}`;
  }

  return `https://${finalWorkspace}.${targetDomain}`;
}

// Check if Do Not Track is enabled
function checkDoNotTrack(): boolean {
  const dntStatus =
    navigator.doNotTrack ||
    (window as any).doNotTrack ||
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
    if (typeof Date.now === "function") {
      return Date.now();
    } else {
      return new Date().getTime();
    }
  },
};

// checks page dom start time
const customTimerModule = {
  isPerformanceAvailable: function () {
    const perf = (window as any).performance;
    return perf && perf.timing !== undefined;
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

const checkNetworkBandwidth = (): string | undefined => {
  const connectionType = navigator as any;
  const connection =
    connectionType?.connection ||
    connectionType?.mozConnection ||
    connectionType?.webkitConnection;

  return connection?.type;
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
  ListenerManager,
  timestamp,
  customTimerModule,
  utilityMethods,
  getRequestTimingDetails,
  fetchHeaders,
};
