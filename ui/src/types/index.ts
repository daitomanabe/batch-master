export type Plugin = {
  id: string;
  name: string;
  vendor: string;
  category: string;
  path: string;
  hasPresets: boolean;
};

export type ChainItem = {
  uid: number;
  pluginId: string;
  pluginPath?: string;
  name: string;
  vendor: string;
  category: string;
  preset: string;
  presetFilePath?: string;
  enabled: boolean;
};

export type BatchJob = {
  id: string;
  inputFile: string;
  outputFile: string;
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  errorMessage?: string;
};

export type SavedChain = {
  name: string;
  createdAt: string;
  chain: ChainItem[];
};

export type ProgressSnapshot = {
  running: boolean;
  cancelled: boolean;
  currentJobId: string;
  currentFile: string;
  currentPercent: number;
  totalJobs: number;
  completedJobs: number;
  jobs: BatchJob[];
};

export type ProgressEvent = {
  type: "progress.update";
  jobId: string;
  file: string;
  percent: number;
  done: boolean;
};

export type BatchDoneEvent = {
  type: "batch.done";
  totalFiles: number;
  elapsed: number;
};

export type ScanLogEvent = {
  type: "scan.log";
  line: string;
};

export type BackendEvent = ProgressEvent | BatchDoneEvent | ScanLogEvent;

export type BackendBridge = {
  isNative: boolean;
  scanPlugins(folderPath: string): Promise<Plugin[]>;
  getPluginList(): Promise<Plugin[]>;
  getScanLogs(): Promise<string[]>;
  clearScanLogs(): Promise<boolean>;
  loadPresets(pluginId: string): Promise<string[]>;
  loadPresetFile(pluginId: string, filePath: string): Promise<boolean>;
  loadChain(chainJSON: string): Promise<boolean>;
  saveChain(name: string, chainJSON: string): Promise<boolean>;
  getSavedChains(): Promise<SavedChain[]>;
  addBatchJob(inputPath: string, outputPath: string): Promise<string>;
  startBatch(): Promise<boolean>;
  getProgress(): Promise<ProgressSnapshot>;
  cancelBatch(): Promise<boolean>;
  addEventListener(
    eventId: BackendEvent["type"],
    callback: (payload: BackendEvent) => void,
  ): number | string | null;
  removeEventListener(token: number | string | null): void;
};
