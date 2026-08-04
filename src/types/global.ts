declare global {
  interface HTMLElement {
    fp?: {
      dispatch?: (event: string, data?: unknown) => void;
      destroy?: () => void;
      destroyHlsMonitoring?: () => void;
      destroyDashMonitoring?: () => void;
      listeners?: unknown;
      utilityMethods?: unknown;
      deleted?: boolean;
      [key: string]: unknown;
    };
  }
}

export {};
