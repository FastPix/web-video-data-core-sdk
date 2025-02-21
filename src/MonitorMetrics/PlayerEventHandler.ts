import {
  checkDoNotTrack,
  formulateBeaconUrl,
  mergeObjects,
} from "../CommonMethods/index";
import {
  getViewerCookie,
  getViewerData,
  updateViewerCookie,
} from "../CookieMethod/index";
import { EventMetaData, ActionableDataTypes } from "../DataType/index";
import { buildUUID } from "../IdGenerationMethod/index";
import { getNetworkConnection } from "../CommonMethods/index";
import { ConnectionHandler } from "../ConnectionHandler/index";
import { formatEventData } from "../SplitDataParameters/index";

interface SDKPageDetails {
  fastpix_embed: string;
  fastpix_embed_version: string;
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
  previousBeaconData: EventMetaData | null;
  sdkPageDetails: SDKPageDetails;
  userData: CookieDataTypes | Object;
  debug: boolean;

  constructor(self = {}, tokenId = "", data: ActionableDataTypes = {}) {
    this.fp = self;
    this.tokenId = tokenId;
    this.actionableData = data || {};
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
      fastpix_embed: "fastpix-core",
      fastpix_embed_version: "1.0.0",
      viewer_connection_type: getNetworkConnection(),
      page_url: window?.location?.href ?? "",
    };
    this.userData = this.disableCookies ? {} : getViewerCookie();
  }

  sendData(event: string, obj: EventMetaData): void {
    if (event && obj && obj.view_id) {
      if (this.respectDoNotTrack && checkDoNotTrack()) {
        if (this.debug) {
          return console.warn(
            `The ${event} won't be sent due to the enabled Do Not Track feature.`,
          );
        } else {
          return;
        }
      }

      if (!obj || typeof obj !== "object") {
        if (this.debug) {
          return console.error(
            "The send() function requires a data object, and it was not supplied as expected.",
          );
        } else {
          return;
        }
      }

      const cookieUpdater = this.disableCookies ? {} : this.updateCookies();
      const data = mergeObjects(
        this.sdkPageDetails,
        obj,
        cookieUpdater,
        this.userData,
        {
          event_name: event,
          workspace_id: this.tokenId,
        },
      );
      const filterData = formatEventData(this.cloneBeaconData(event, data));

      if (
        !this.tokenId &&
        this.debug &&
        !this.actionableData?.actionableData?.beaconCollectionDomain
      ) {
        console.warn(
          "Missing workspace id (workspaceId) - beacons will be dropped",
          event,
          data,
          filterData,
        );
      } else {
        if (this.tokenId) {
          this.eventQueue.scheduleEvent(filterData);

          if (event === "viewCompleted") {
            this.eventQueue.destroy(true);
          } else if (eventHandler.indexOf(event) >= 0) {
            this.eventQueue.processEventQueue();
          }
        }
      }
    }
  }

  destroy(): void {
    this.eventQueue.destroy(false);
  }

  cloneBeaconData(eventname: string, dataobj: any): EventMetaData | any | null {
    let clonedObj: EventMetaData | any | null = {};

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

  updateCookies(): {
    session_id: string;
    session_start: string;
    session_expiry_time: number;
  } {
    const data = getViewerData();
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
