import {
  checkDoNotTrack,
  formulateBeaconUrl,
  mergeObjects,
  getNetworkConnection,
  getNetworkSpeed,
  getTimezoneName,
  getScreenOrientation,
} from "../CommonMethods/index";
import {
  getViewerCookie,
  getViewerData,
  updateViewerCookie,
} from "../CookieMethod/index";
import { EventMetaData, ActionableDataTypes } from "../DataType/index";
import { buildUUID } from "../IdGenerationMethod/index";
import { ConnectionHandler } from "../ConnectionHandler/index";
import { formatEventData } from "../SplitDataParameters/index";

interface SDKPageDetails {
  viewer_connection_type: string | undefined;
  viewer_connection_speed: string | undefined;
  viewer_cookies_enabled: boolean | undefined;
  viewer_device_orientation: string | undefined;
  viewer_dnt_on: boolean;
  viewer_timezone_name: string | undefined;
  viewer_browser_width: number | undefined;
  viewer_browser_height: number | undefined;
  page_url: string;
  page_title: string;
  page_referrer_url: string;
  page_site_domain: string;
}

interface CookieDataTypes {
  fpviid?: string;
  fpsanu?: number;
  snst?: string;
  snid?: string;
  snepti?: number;
}

const keyParams = [
  "workspace_id",
  "view_id",
  "view_sequence_number",
  "player_sequence_number",
  "beacon_domain",
  "player_playhead_time",
  "viewer_timestamp",
  "event_name",
  "video_id",
  "player_instance_id",
];
const videoStateKeys = new Set([
  "player_is_paused",
  "player_width",
  "player_height",
  "player_autoplay_on",
  "player_preload_on",
  "player_is_fullscreen",
  "player_is_pip",
  "player_muted",
  "player_default_muted_on",
  "player_viewable_on",
  "player_viewable_percentage",
  "player_volume_level",
  "player_playback_rate",
  "player_default_playback_rate",
  "player_loop_on",
  "player_controls_on",
  "player_subtitles_on",
  "player_subtitles_language_code",
  "video_source_height",
  "video_source_width",
  "video_source_stream_protocol",
  "video_source_url",
  "video_source_domain",
  "video_source_hostname",
  "video_source_duration",
  "video_source_buffer_length",
  "player_program_date_time",
  "video_poster_url",
  "player_language_code",
  "view_dropped_frame_count",
]);
const eventHandler = new Set(["viewBegin", "error", "ended", "viewCompleted"]);
let previousVideoState: any = {};

export class PlaybackEventHandler {
  fp: any;
  tokenId: string;
  actionableData: ActionableDataTypes;
  sampleRate: string | number;
  disableCookies: boolean;
  respectDoNotTrack: boolean;
  eventQueue: ConnectionHandler;
  previousBeaconData: EventMetaData | null | Record<string, string>;
  sdkPageDetails: SDKPageDetails;
  userData: CookieDataTypes | Object;
  debug: boolean;
  nucleus: any;

  constructor(
    self = {},
    tokenId = "",
    data: ActionableDataTypes = {},
    nucleus: any = undefined,
  ) {
    this.nucleus = nucleus;
    this.fp = self;
    this.tokenId = tokenId;
    this.actionableData = data ?? {};
    this.debug = this.actionableData?.debug ?? false;
    this.sampleRate = this.actionableData?.sampleRate ?? 1;
    this.disableCookies = this.actionableData?.disableCookies ?? false;
    this.respectDoNotTrack = this.actionableData?.respectDoNotTrack ?? false;
    this.eventQueue = new ConnectionHandler(
      formulateBeaconUrl(this.tokenId, this.actionableData),
      this.actionableData,
    );
    this.previousBeaconData = null;
    const canAccessDocument = document !== undefined;
    this.sdkPageDetails = {
      viewer_connection_type: getNetworkConnection(),
      viewer_connection_speed: getNetworkSpeed(),
      viewer_cookies_enabled: navigator?.cookieEnabled,
      viewer_device_orientation: getScreenOrientation(),
      viewer_dnt_on: checkDoNotTrack(),
      viewer_timezone_name: getTimezoneName(),
      viewer_browser_width: window?.innerWidth,
      viewer_browser_height: window?.innerHeight,
      page_url: window === undefined ? "" : window?.location?.href,
      page_title: canAccessDocument ? document.title : "",
      page_referrer_url: canAccessDocument ? document.referrer : "",
      page_site_domain: window === undefined ? "" : window?.location?.hostname,
    };

    this.userData =
      !this.disableCookies && canAccessDocument ? getViewerCookie() : {};
  }

  sendData(event: string, obj: EventMetaData): void {
    if (!event || !obj?.view_id) return;
    if (this.shouldRespectDoNotTrack(event)) return;
    if (!this.validateEventData(obj)) return;
    if (
      !this.tokenId &&
      this.debug &&
      !this.actionableData?.actionableData?.beaconCollectionDomain
    ) {
      console.warn(
        "Missing workspace id (workspaceId) - beacons will be dropped",
        event,
      );
      return;
    }
    let data = this.prepareEventData(event, obj);
    data = Object.fromEntries(
      Object.entries(data).filter(
        ([_, value]) => value !== undefined && !Number.isNaN(value),
      ),
    );

    this.eventQueue.scheduleEvent(data);

    if (event === "viewCompleted") {
      this.eventQueue.destroy(true);
    } else if (eventHandler.has(event)) {
      // hls.js swapping the media element at an interstitial boundary makes the
      // browser raise ended even though the content has not finished - it fires
      // ten seconds into a three minute video. Flushing on that would send a
      // premature end-of-playback beacon, so a break in progress keeps the
      // event queued and batched like any other.
      if (event === "ended" && this.nucleus?.adBreakActive) {
        return;
      }

      this.eventQueue.processEventQueue();
    }
  }

  shouldRespectDoNotTrack(event: string): boolean {
    if (this.respectDoNotTrack && checkDoNotTrack()) {
      if (this.debug) {
        console.warn(
          `The ${event} won't be sent due to the enabled Do Not Track feature.`,
        );
      }
      return true;
    }
    return false;
  }

  validateEventData(obj: EventMetaData): boolean {
    if (!obj || typeof obj !== "object") {
      if (this.debug) {
        console.error(
          "The send() function requires a data object, and it was not supplied as expected.",
        );
      }
      return false;
    }
    return true;
  }

  prepareEventData(event: string, obj: EventMetaData) {
    const cookieSessionData =
      this.disableCookies || document === undefined ? {} : this.updateCookies();

    const data = mergeObjects(
      this.sdkPageDetails,
      obj,
      cookieSessionData,
      this.userData,
      {
        event_name: event,
        workspace_id: this.tokenId,
      },
    );
    return formatEventData(this.cloneBeaconData(event, data));
  }

  destroy(): void {
    this.eventQueue.destroy(false);
  }

  cloneBeaconData(eventname: string, dataobj: any): EventMetaData {
    let clonedObj: Record<string, string> = {};

    if (eventname === "viewBegin" || eventname === "viewCompleted") {
      clonedObj = Object.assign(clonedObj, dataobj);

      if (eventname === "viewCompleted") {
        this.previousBeaconData = null;
      }
      this.previousBeaconData = clonedObj;
    } else {
      keyParams.forEach((param) => (clonedObj[param] = dataobj[param]));
      Object.assign(clonedObj, this.getTrimmedState(dataobj));

      if (
        ["requestCompleted", "requestFailed", "requestCanceled"].includes(
          eventname,
        )
      ) {
        Object.entries(dataobj).forEach(([key, value]: [string, any]) => {
          if (key.startsWith("request")) {
            clonedObj[key] = value;
          }
        });
      }

      if (eventname === "variantChanged") {
        Object.entries(dataobj).forEach(([key, value]: [string, any]) => {
          if (key.startsWith("video_source")) {
            clonedObj[key] = value;
          }
        });
      }
      this.previousBeaconData = clonedObj;
    }

    if (eventname === "viewCompleted") {
      const updatedClonedObj: any = {};
      const shadowState = Object.keys(clonedObj);
      shadowState.forEach((key) => {
        if (!videoStateKeys.has(key)) {
          updatedClonedObj[key] = clonedObj[key];
        }
      });
      this.previousBeaconData = updatedClonedObj;

      return updatedClonedObj;
    }

    // @ts-ignore
    return clonedObj;
  }

  getTrimmedState(currentData: any): any {
    if (
      JSON.stringify(this.previousBeaconData) !== JSON.stringify(currentData)
    ) {
      const trimmedData: any = {};
      for (let key in currentData) {
        if (currentData[key] !== previousVideoState[key]) {
          trimmedData[key] = currentData[key];
        }
      }
      previousVideoState = currentData;

      return trimmedData;
    }
  }

  updateCookies():
    | {
        session_id: string;
        session_start: string;
        session_expiry_time: number | string;
      }
    | {} {
    if (document === undefined) return {};

    const data: any = getViewerData();
    const cookieTimer = Date.now();

    if (
      !data.fpviid ||
      !data.fpsanu ||
      data.fpviid === "undefined" ||
      data.fpsanu === "undefined"
    ) {
      data.fpviid = buildUUID();
      data.fpsanu = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    }

    if (
      !data.snst ||
      !data.snid ||
      data.snid === "undefined" ||
      data.snst === "undefined" ||
      cookieTimer - Number.parseInt(data.snst, 10) > 864e5
    ) {
      data.snst = cookieTimer;
      data.snid = buildUUID();
    }

    data.snepti = cookieTimer + 15e5;
    updateViewerCookie(data);

    return {
      session_id: data.snid!,
      session_start: data.snst!,
      session_expiry_time: data.snepti!,
    };
  }
}
