interface RequestData {
  request_start: number;
  request_response_start: number;
  request_response_end: number;
  request_bytes_loaded: number;
  view_min_request_throughput?: number;
  view_avg_request_throughput?: number;
  view_request_count: number;
  view_max_request_latency?: number;
  view_avg_request_latency?: number;
  view_request_failed_count?: number;
  view_request_canceled_count?: number;
  [key: string]: any;
}

interface Req {
  data: RequestData;
}

interface Emitter {
  on: (event: string, callback: Function) => void;
}

export class RequestMetricsMonitor {
  totalLatency: number = 0;
  totalBytes: number = 0;
  totalTime: number = 0;
  requestCount: number = 0;
  processedChunks: number = 0;
  failedRequests: number = 0;
  canceledRequests: number = 0;
  req: Req;
  emitter: Emitter;

  constructor(req: Req, emitter: Emitter) {
    this.req = req;
    this.emitter = emitter;
    this.initializeEventListeners();
  }

  initializeEventListeners(): void {
    this.emitter.on("requestCompleted", (reqData: RequestData) =>
      this.handleRequestCompleted(reqData),
    );
    this.emitter.on("requestFailed", () => this.handleRequestFailed());
    this.emitter.on("requestCanceled", () => this.handleRequestCanceled());
  }

  handleRequestCompleted(reqData: RequestData): void {
    const requestStart: number = reqData?.request_start || 0;
    const responseStart: number = reqData?.request_response_start || 0;
    const responseEnd: number = reqData?.request_response_end || 0;
    const loadedBytes: number = reqData?.request_bytes_loaded || 0;

    this.requestCount++;

    const latency = responseStart - requestStart;
    const duration = responseEnd - (responseStart || requestStart);

    if (duration > 0 && loadedBytes > 0) {
      this.processedChunks++;
      this.totalBytes += loadedBytes;
      this.totalTime += duration;

      const throughput = (loadedBytes / duration) * 8000;
      this.req.data.view_min_request_throughput = Math.min(
        this.req.data.view_min_request_throughput || Infinity,
        throughput,
      );
      this.req.data.view_avg_request_throughput =
        (this.totalBytes / this.totalTime) * 8000;
      this.req.data.view_request_count = this.requestCount;

      if (latency > 0) {
        this.totalLatency += latency;
        this.req.data.view_max_request_latency = Math.max(
          this.req.data.view_max_request_latency || 0,
          latency,
        );
        this.req.data.view_avg_request_latency =
          this.totalLatency / this.processedChunks;
      }
    }
  }

  handleRequestFailed(): void {
    this.requestCount++;
    this.failedRequests++;
    this.req.data.view_request_count = this.requestCount;
    this.req.data.view_request_failed_count = this.failedRequests;
  }

  handleRequestCanceled(): void {
    this.requestCount++;
    this.canceledRequests++;
    this.req.data.view_request_count = this.requestCount;
    this.req.data.view_request_canceled_count = this.canceledRequests;
  }
}
