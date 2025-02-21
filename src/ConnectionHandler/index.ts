import type { ActionableDataTypes } from "../DataType/index";

import { timestamp } from "../CommonMethods/index";

type EventData = { [key: string]: any };

const makeApiCall = async (
  postcall: string | URL,
  logData: string,
  destroyer: boolean,
  failure: (arg0?: null | undefined, arg1?: string | null) => void,
): Promise<void> => {
  try {
    if (
      destroyer &&
      navigator.sendBeacon &&
      navigator.sendBeacon(postcall, logData)
    ) {
      failure();
    }

    try {
      const response = await fetch(postcall, {
        method: "POST",
        body: logData,
        headers: {
          "Content-Type": "text/plain",
        },
      });

      return failure(null, response.ok ? null : "Error");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Fetch error";

      return failure(null, errorMessage);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Fetch error";

    return failure(null, errorMessage);
  }
};

export class ConnectionHandler {
  postApiUrl: string;
  eventStack: EventData[];
  checkPostData: boolean;
  callPostTimer: number | null;
  destroyed: boolean;
  chunkTimer?: number;
  actionableData: ActionableDataTypes;

  constructor(api: string, actionableData: any) {
    this.postApiUrl = api;
    this.actionableData = actionableData;
    this.eventStack = [];
    this.checkPostData = false;
    this.callPostTimer = null;
    this.destroyed = false;
  }

  scheduleEvent(data: EventData): void {
    const eventData = { ...data };
    this.eventStack.push(eventData);
    this.destroyed = false;

    if (!this.callPostTimer) {
      this.triggerBeaconDispatch();
    }
  }

  processEventQueue(): void {
    this.emitBeaconQueue();
    this.triggerBeaconDispatch();
  }

  destroy(ondestroy: boolean): void {
    this.destroyed = true;

    if (ondestroy) {
      this.purgeBeaconQueue();
    } else {
      this.processEventQueue();
    }

    if (this.callPostTimer) {
      clearTimeout(this.callPostTimer);
    }
  }

  purgeBeaconQueue(): void {
    const excessLength = this.eventStack.length - 200;
    const trimmedStack = this.eventStack.slice(
      excessLength > 0 ? excessLength : 0,
    );
    const postData = this.generatePayload(trimmedStack);

    if (!this.actionableData?.actionableData?.respectDoNotTrack) {
      makeApiCall(this.postApiUrl, postData, true, () => {});
    }
  }

  emitBeaconQueue(): void {
    if (!this.checkPostData) {
      const stackedEvents = this.eventStack.slice(0, 200);
      const payload = this.generatePayload(stackedEvents);
      const preApiCallTime = timestamp.now();
      this.eventStack = this.eventStack.slice(200);
      this.checkPostData = true;

      if (!this.actionableData?.actionableData?.respectDoNotTrack) {
        makeApiCall(this.postApiUrl, payload, false, (_data, error) => {
          if (error) {
            this.eventStack = stackedEvents.concat(this.eventStack);
            console.warn(`Error sending beacon:`, error);
          }
          this.chunkTimer = timestamp.now() - preApiCallTime;
          this.checkPostData = false;
        });
      }
    }
  }

  triggerBeaconDispatch(): void {
    if (this.callPostTimer) {
      clearTimeout(this.callPostTimer);
    }

    if (!this.destroyed) {
      this.callPostTimer = setTimeout(() => {
        if (this.eventStack.length) {
          this.emitBeaconQueue();
        }
        this.triggerBeaconDispatch();
      }, 1e4) as unknown as number;
    }
  }

  generatePayload(events: EventData[]): string {
    const chunkDetails: { transmission_timestamp: number; rtt_ms?: number } = {
      transmission_timestamp: Math.round(timestamp.now()),
    };

    if (this.chunkTimer) {
      chunkDetails.rtt_ms = Math.round(this.chunkTimer);
    }

    const stringifyData = (eventsChunk: EventData[]): { payload: string } => {
      const payload = JSON.stringify({
        metadata: chunkDetails,
        events: eventsChunk,
      });

      return { payload };
    };

    const { payload } = stringifyData(events);

    return payload;
  }
}
