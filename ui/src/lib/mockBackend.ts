import type {
  BackendBridge,
  BackendEvent,
  BatchDoneEvent,
  BatchJob,
  ChainItem,
  Plugin,
  ProgressEvent,
  ProgressSnapshot,
  SavedChain,
} from "../types";

const mockPlugins: Plugin[] = [
  {
    id: "ozone-12",
    name: "Ozone 12",
    vendor: "iZotope",
    category: "Mastering",
    path: "/Library/Audio/Plug-Ins/VST3/iZotope/Ozone 12.vst3",
    hasPresets: true,
  },
  {
    id: "pro-l-2",
    name: "Pro-L 2",
    vendor: "FabFilter",
    category: "Limiter",
    path: "/Library/Audio/Plug-Ins/VST3/FabFilter/Pro-L 2.vst3",
    hasPresets: true,
  },
  {
    id: "pro-q-3",
    name: "Pro-Q 3",
    vendor: "FabFilter",
    category: "EQ",
    path: "/Library/Audio/Plug-Ins/VST3/FabFilter/Pro-Q 3.vst3",
    hasPresets: true,
  },
];

const mockPresets = new Map<string, string[]>([
  ["ozone-12", ["Streaming Master", "Club Finish", "Wide Glue"]],
  ["pro-l-2", ["Transparent", "Modern", "Punchy"]],
  ["pro-q-3", ["Gentle Master EQ", "Air Lift", "Sub Tame"]],
]);

let currentChainJson = "[]";
let eventToken = 0;
let timerId: number | null = null;
const scanLogs: string[] = [];
let cachedPlugins: Plugin[] = [...mockPlugins];

const listeners = new Map<number, { eventId: BackendEvent["type"]; callback: (payload: BackendEvent) => void }>();
const savedChains: SavedChain[] = [];
const jobs: BatchJob[] = [];
const progressSnapshot: ProgressSnapshot = {
  running: false,
  cancelled: false,
  currentJobId: "",
  currentFile: "",
  currentPercent: 0,
  totalJobs: 0,
  completedJobs: 0,
  jobs,
};

function emit(payload: BackendEvent) {
  listeners.forEach((listener) => {
    if (listener.eventId === payload.type) {
      listener.callback(payload);
    }
  });
}

function logScan(line: string) {
  const timestampedLine = `[${new Date().toLocaleTimeString("ja-JP", { hour12: false })}] ${line}`;
  scanLogs.push(timestampedLine);

  if (scanLogs.length > 500) {
    scanLogs.splice(0, scanLogs.length - 500);
  }

  emit({
    type: "scan.log",
    line: timestampedLine,
  });
}

function cloneChain(chain: ChainItem[]): ChainItem[] {
  return chain.map((item, index) => ({
    ...item,
    uid: item.uid || index + 1,
  }));
}

function updateSnapshot() {
  progressSnapshot.jobs = [...jobs];
  progressSnapshot.totalJobs = jobs.length;
  progressSnapshot.completedJobs = jobs.filter((job) => job.status === "done").length;
}

function ensureTimer() {
  if (timerId !== null) {
    return;
  }

  timerId = window.setInterval(() => {
    if (!progressSnapshot.running) {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }

      return;
    }

    const activeJob = jobs.find((job) => job.status === "processing") ?? jobs.find((job) => job.status === "queued");

    if (!activeJob) {
      progressSnapshot.running = false;
      progressSnapshot.currentJobId = "";
      progressSnapshot.currentFile = "";
      progressSnapshot.currentPercent = 0;
      updateSnapshot();

      const batchDone: BatchDoneEvent = {
        type: "batch.done",
        totalFiles: progressSnapshot.completedJobs,
        elapsed: Number((jobs.length * 1.8).toFixed(1)),
      };

      emit(batchDone);
      return;
    }

    if (activeJob.status === "queued") {
      activeJob.status = "processing";
      progressSnapshot.currentJobId = activeJob.id;
      progressSnapshot.currentFile = activeJob.inputFile;
    }

    activeJob.progress = Math.min(1, activeJob.progress + 0.1);
    progressSnapshot.currentPercent = activeJob.progress;
    updateSnapshot();

    const progressEvent: ProgressEvent = {
      type: "progress.update",
      jobId: activeJob.id,
      file: activeJob.inputFile,
      percent: activeJob.progress,
      done: activeJob.progress >= 1,
    };

    emit(progressEvent);

    if (activeJob.progress >= 1) {
      activeJob.status = "done";
      progressSnapshot.currentPercent = 0;
      updateSnapshot();
    }
  }, 350);
}

export const mockBackend: BackendBridge = {
  isNative: false,
  async scanPlugins() {
    logScan("[scan] Starting VST3 scan.");
    logScan("[scan] Fixed root: /Library/Audio/Plug-Ins/VST3");

    for (const plugin of mockPlugins) {
      logScan(`[scan] Inspecting ${plugin.path}`);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      logScan(`[scan] Added plugin: ${plugin.name} (${plugin.vendor})`);
    }

    cachedPlugins = [...mockPlugins];
    logScan(`[cache] Saved plugin cache to ~/Library/Application Support/BatchMaster/plugin-cache.json`);
    logScan(`[scan] Completed. ${cachedPlugins.length} plugins cached.`);
    return [...cachedPlugins];
  },
  async getPluginList() {
    logScan(`[cache] Returning ${cachedPlugins.length} cached plugins.`);
    return [...cachedPlugins];
  },
  async getScanLogs() {
    return [...scanLogs];
  },
  async clearScanLogs() {
    scanLogs.splice(0, scanLogs.length);
    return true;
  },
  async loadPresets(pluginId) {
    return [...(mockPresets.get(pluginId) ?? [])];
  },
  async loadPresetFile(_pluginId, filePath) {
    return filePath.endsWith(".vstpreset");
  },
  async loadChain(chainJSON) {
    currentChainJson = chainJSON;
    return true;
  },
  async saveChain(name, chainJSON) {
    const parsed = JSON.parse(chainJSON) as ChainItem[];
    savedChains.unshift({
      name,
      createdAt: new Date().toISOString(),
      chain: cloneChain(parsed),
    });
    return true;
  },
  async getSavedChains() {
    return savedChains.map((chain) => ({
      ...chain,
      chain: cloneChain(chain.chain),
    }));
  },
  async addBatchJob(inputPath, outputPath) {
    if (!inputPath || !outputPath) {
      return "";
    }

    const job: BatchJob = {
      id: `job-${crypto.randomUUID()}`,
      inputFile: inputPath,
      outputFile: outputPath,
      status: "queued",
      progress: 0,
    };

    jobs.push(job);
    updateSnapshot();
    return job.id;
  },
  async startBatch() {
    if (progressSnapshot.running || jobs.every((job) => job.status !== "queued") || currentChainJson === "[]") {
      return false;
    }

    progressSnapshot.running = true;
    progressSnapshot.cancelled = false;
    ensureTimer();
    return true;
  },
  async getProgress() {
    updateSnapshot();
    return {
      ...progressSnapshot,
      jobs: [...jobs],
    };
  },
  async cancelBatch() {
    progressSnapshot.running = false;
    progressSnapshot.cancelled = true;

    jobs.forEach((job) => {
      if (job.status === "processing") {
        job.status = "error";
        job.errorMessage = "Cancelled";
      }
    });

    updateSnapshot();
    return true;
  },
  addEventListener(eventId, callback) {
    eventToken += 1;
    listeners.set(eventToken, { eventId, callback });
    return eventToken;
  },
  removeEventListener(token) {
    if (typeof token === "number") {
      listeners.delete(token);
    }
  },
};
