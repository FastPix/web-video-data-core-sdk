import {
  checkDoNotTrack,
  formulateBeaconUrl,
  mergeObjects,
  getNetworkConnection,
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
  page_url: string;
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
const videoStateKeys = [
  "player_is_paused",
  "player_width",
  "player_height",
  "player_autoplay_on",
  "player_preload_on",
  "player_is_fullscreen",
  "video_source_height",
  "video_source_width",
  "video_source_url",
  "video_source_domain",
  "video_source_hostname",
  "video_source_duration",
  "video_poster_url",
  "player_language_code",
  "view_dropped_frame_count",
];
const eventHandler = ["viewBegin", "error", "ended", "viewCompleted"];
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

  constructor(self = {}, tokenId = "", data: ActionableDataTypes = {}) {
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
    this.sdkPageDetails = {
      viewer_connection_type: getNetworkConnection(),
      page_url: typeof window !== "undefined" ? window?.location?.href : "",
    };

    const canAccessDocument = typeof document !== "undefined";
    this.userData = (this.disableCookies || !canAccessDocument)
      ? {}
      : getViewerCookie();
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
    } else if (eventHandler.includes(event)) {
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
      this.disableCookies || typeof document === "undefined"
        ? {}
        : this.updateCookies();

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
        if (!videoStateKeys.includes(key)) {
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
    if (typeof document === "undefined") return {};

    const data: any = getViewerData();
    const cookieTimer = Date.now();

    if (
      !data.fpviid ||
      !data.fpsanu ||
      data.fpviid === "undefined" ||
      data.fpsanu === "undefined"
    ) {
      data.fpviid = buildUUID();
      data.fpsanu = Math.random();
    }

    if (
      !data.snst ||
      !data.snid ||
      data.snid === "undefined" ||
      data.snst === "undefined" ||
      cookieTimer - parseInt(data.snst) > 864e5
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
