interface ErrorData {
  player_error_code?: string | number;
  player_error_message?: string;
  player_error_context?: string;
  // Declared by the integration when the failure is a business rule rather than
  // a delivery fault - entitlement, geo block, concurrency limit and the like
  player_error_business_exception?: boolean;
  player_error_severity?: string;
  view_playback_business_exception?: boolean;
  view_playback_failed?: boolean;
  view_startup_business_exception?: boolean;
  // Set on the first 'playing' event, so its presence marks a view that reached
  // first frame. It is what separates a startup exception from a playback one.
  view_time_to_first_frame?: number;
}

interface AccuracyData {
  data: ErrorData;
  userConfigData?: {
    actionableData?: {
      debug?: boolean;
    };
  };
}

const errorKeys: (keyof ErrorData)[] = [
  "player_error_code",
  "player_error_message",
  "player_error_context",
  "player_error_business_exception",
  "player_error_severity",
];

export class ErrorManager {
  accuracy: AccuracyData;
  eventEmitter: any;
  hasErrorOccurred: boolean;

  constructor(accuracy: AccuracyData, eventEmitter: any) {
    this.accuracy = accuracy;
    this.eventEmitter = eventEmitter;
    this.hasErrorOccurred = false;
    this.setupEventListeners();
  }

  setupEventListeners(): void {
    this.eventEmitter.on("configureView", () => {
      this.hasErrorOccurred = false;
    });

    this.eventEmitter.on("error", (errorInfo: ErrorData) => {
      let errorRecorded = false;

      try {
        if (
          errorInfo?.player_error_code ||
          errorInfo.player_error_message ||
          errorInfo.player_error_context
        ) {
          this.accuracy.data.player_error_code =
            errorInfo.player_error_code ?? "";
          this.accuracy.data.player_error_message =
            errorInfo.player_error_message ?? "";
          this.accuracy.data.player_error_context =
            errorInfo.player_error_context ?? "";
          // Written on every error rather than left to carry over, so an
          // exception flagged once does not stay attached to later errors
          this.accuracy.data.player_error_business_exception =
            errorInfo.player_error_business_exception === true;
          this.accuracy.data.player_error_severity =
            errorInfo.player_error_severity ?? "fatal";
          this.hasErrorOccurred = true;
          errorRecorded = true;
        } else {
          errorKeys.forEach((key) => delete this.accuracy.data[key]);
        }
      } catch (err) {
        if (this.accuracy.userConfigData?.actionableData?.debug) {
          console.warn(
            "Exception raised within the error handler callback",
            err,
          );
        }
        this.hasErrorOccurred = true;
      }

      if (errorRecorded) {
        this.classifyFailure(errorInfo);
      }
    });
  }

  // Deliberately outside the handler's try block. A throw in here would be
  // swallowed and would latch hasErrorOccurred, which stops the pulse timer and
  // silently halts watch time, buffering and scaling collection for the view.
  classifyFailure(errorInfo: ErrorData): void {
    if (errorInfo?.player_error_severity === "warning") {
      return;
    }

    const data = this.accuracy.data;
    const reachedFirstFrame = data.view_time_to_first_frame !== undefined;

    if (errorInfo?.player_error_business_exception === true) {
      if (reachedFirstFrame) {
        data.view_playback_business_exception = true;
      } else {
        data.view_startup_business_exception = true;
      }
    } else if (reachedFirstFrame) {
      // A fatal fault before first frame is a startup failure, which the
      // backend already derives from the absence of a first frame
      data.view_playback_failed = true;
    }
  }
}
