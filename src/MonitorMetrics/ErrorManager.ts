interface ErrorData {
  player_error_code?: string | number;
  player_error_message?: string;
  player_error_context?: string;
}

interface AccuracyData {
  data: ErrorData;
  userConfigData?: {
    actionableData?: {
      debug?: boolean;
    };
  };
}

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
      try {
        if (
          errorInfo?.player_error_code ||
          errorInfo.player_error_message ||
          errorInfo.player_error_context
        ) {
          this.accuracy.data.player_error_code = errorInfo.player_error_code ?? "";
          this.accuracy.data.player_error_message =
            errorInfo.player_error_message ?? "";
          this.accuracy.data.player_error_context =
            errorInfo.player_error_context ?? "";
          this.hasErrorOccurred = true;
        } else {
          delete this.accuracy.data.player_error_code;
          delete this.accuracy.data.player_error_message;
          delete this.accuracy.data.player_error_context;
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
    });
  }
}
