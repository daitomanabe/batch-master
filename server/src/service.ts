import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { copyFile, open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { EventStream } from "./events.js";
import type {
  BatchJob,
  BootstrapPayload,
  EngineState,
  FxChainCandidate,
  ReaperInfo,
  RenderProfile,
  SavedBatchSettings,
  StateEventPayload,
} from "./types.js";

type ProfileInput = {
  name: string;
  fxChainSourcePath?: string;
  notes?: string;
  copyToManagedStore?: boolean;
};

type ProfileUpdateInput = {
  name?: string;
  fxChainSourcePath?: string;
  notes?: string;
  copyToManagedStore?: boolean;
  clearFxChain?: boolean;
};

type JobInput = {
  profileId: string;
  inputPath: string;
  outputPath: string;
};

type BatchJobInput = {
  profileId: string;
  inputPaths: string[];
  outputDirectory?: string;
};

type FolderJobInput = {
  profileId: string;
  inputDirectory: string;
  outputBaseDirectory?: string;
  recursive?: boolean;
};

type SavedSettingsInput = {
  name: string;
  profileId: string;
  inputDirectory: string;
  outputBaseDirectory?: string;
  recursive?: boolean;
};

type SavedSettingsUpdateInput = {
  name?: string;
  profileId?: string;
  inputDirectory?: string;
  outputBaseDirectory?: string;
  recursive?: boolean;
};

const REAPER_BINARY = process.env.BM_REAPER_PATH ?? "/Applications/REAPER.app/Contents/MacOS/REAPER";
const REAPER_RESOURCE_DIR = path.join(os.homedir(), "Library/Application Support/REAPER");
const APP_DATA_DIR = path.join(os.homedir(), "Library/Application Support/BatchMaster");
const MANAGED_FXCHAINS_DIR = path.join(APP_DATA_DIR, "fxchains");
const RUNS_DIR = path.join(APP_DATA_DIR, "runs");
const LOGS_DIR = path.join(APP_DATA_DIR, "logs");
const PROFILES_PATH = path.join(APP_DATA_DIR, "profiles.json");
const SAVED_SETTINGS_PATH = path.join(APP_DATA_DIR, "saved-settings.json");
const JOBS_PATH = path.join(APP_DATA_DIR, "jobs.json");
const ENGINE_LOG_PATH = path.join(LOGS_DIR, "engine.log");

const EMPTY_ENGINE_STATE: EngineState = {
  running: false,
  cancelling: false,
  currentJobId: "",
  totalJobs: 0,
  completedJobs: 0,
  failedJobs: 0,
  queuedJobs: 0,
  startedAt: null,
  finishedAt: null,
};

function nowIso() {
  return new Date().toISOString();
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "profile";
}

function buildId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function ensureDir(directory: string) {
  mkdirSync(directory, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizePathSegment(value: string) {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().replace(/\s+/g, " ");
  return sanitized || "Render";
}

function isWavFile(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".wav" || extension === ".wave";
}

function collectWavFiles(directory: string, recursive: boolean, excludedDirectories: Set<string> = new Set()) {
  const resolvedRoot = path.resolve(directory);
  const stack = [resolvedRoot];
  const files: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    const dirEntries = readdirSync(current, { withFileTypes: true });

    for (const entry of dirEntries) {
      const absolutePath = path.join(current, entry.name);
      const resolvedPath = path.resolve(absolutePath);

      if (entry.isDirectory()) {
        if (!recursive && current === resolvedRoot) {
          continue;
        }

        if (recursive && !excludedDirectories.has(resolvedPath)) {
          stack.push(resolvedPath);
        }

        continue;
      }

      if (entry.isFile() && isWavFile(resolvedPath)) {
        files.push(resolvedPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function buildOutputPathForInput(
  inputPath: string,
  profileName: string,
  options?: { outputBaseDirectory?: string; inputRootDirectory?: string },
) {
  const parsed = path.parse(inputPath);
  const profileDirectoryName = sanitizePathSegment(profileName);
  const outputRoot = options?.outputBaseDirectory?.trim() || options?.inputRootDirectory || parsed.dir;
  const relativePath = options?.inputRootDirectory ? path.relative(options.inputRootDirectory, inputPath) : parsed.base;
  const safeRelativePath = relativePath && !relativePath.startsWith("..") ? relativePath : parsed.base;
  return path.join(outputRoot, profileDirectoryName, safeRelativePath);
}

function ensureUniqueOutputPath(outputPath: string, usedPaths: Set<string>) {
  if (!usedPaths.has(outputPath)) {
    usedPaths.add(outputPath);
    return outputPath;
  }

  const parsed = path.parse(outputPath);
  let index = 2;

  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);

    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }

    index += 1;
  }
}

export class BatchMasterService {
  private readonly events = new EventStream();
  private reaperInfo: ReaperInfo;
  private profiles: RenderProfile[];
  private savedSettings: SavedBatchSettings[];
  private jobs: BatchJob[];
  private logs: string[];
  private engine = { ...EMPTY_ENGINE_STATE };
  private currentChild: ChildProcess | null = null;
  private cancelRequested = false;
  private runPromise: Promise<void> | null = null;

  constructor() {
    ensureDir(APP_DATA_DIR);
    ensureDir(MANAGED_FXCHAINS_DIR);
    ensureDir(RUNS_DIR);
    ensureDir(LOGS_DIR);

    this.reaperInfo = this.detectReaper();
    this.profiles = readJsonFile<RenderProfile[]>(PROFILES_PATH, []);
    this.savedSettings = readJsonFile<SavedBatchSettings[]>(SAVED_SETTINGS_PATH, []);
    this.jobs = readJsonFile<BatchJob[]>(JOBS_PATH, []).map((job) => ({
      ...job,
      progress: job.status === "done" ? 1 : job.status === "processing" ? 0 : job.progress ?? 0,
      currentStep: job.currentStep ?? "",
      errorMessage: job.errorMessage ?? "",
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      splashLogPath: job.splashLogPath ?? null,
      stderrLogPath: job.stderrLogPath ?? null,
      status: job.status === "processing" ? "queued" : job.status,
    }));
    this.logs = this.readLogTail(ENGINE_LOG_PATH, 300);

    if (this.profiles.length === 0) {
      this.profiles = [
        {
          id: randomUUID(),
          name: "Dry Run",
          fxChainPath: null,
          importedFxChainPath: null,
          notes: "Render with no FX chain. Use this to validate REAPER and routing.",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      ];
      this.saveProfiles();
    }

    this.refreshEngineCounters();
    this.log(`BatchMaster booted. REAPER ${this.reaperInfo.available ? "detected" : "not found"} at ${this.reaperInfo.binaryPath}`);
  }

  getBootstrap(): BootstrapPayload {
    return {
      profiles: this.profiles,
      savedSettings: this.savedSettings,
      jobs: this.jobs,
      engine: this.engine,
      logs: this.logs,
      reaper: this.reaperInfo,
      fxChains: this.listFxChains(),
    };
  }

  getStatePayload(): StateEventPayload {
    return {
      profiles: this.profiles,
      savedSettings: this.savedSettings,
      jobs: this.jobs,
      engine: this.engine,
      reaper: this.reaperInfo,
      fxChains: this.listFxChains(),
    };
  }

  subscribe(response: import("express").Response) {
    this.events.addClient(response);
    this.events.emitToClient(response, "state", this.getStatePayload());
    this.events.emitToClient(response, "logs", this.logs);
  }

  listFxChains(): FxChainCandidate[] {
    const candidates: FxChainCandidate[] = [];

    const collect = (directory: string, source: FxChainCandidate["source"]) => {
      if (!existsSync(directory)) {
        return;
      }

      const stack = [directory];

      while (stack.length > 0) {
        const current = stack.pop() as string;
        const dirEntries = readdirSync(current, { withFileTypes: true });

        for (const entry of dirEntries) {
          const absolutePath = path.join(current, entry.name);

          if (entry.isDirectory()) {
            stack.push(absolutePath);
            continue;
          }

          if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".rfxchain")) {
            continue;
          }

          candidates.push({
            id: buildId(`${source}:${absolutePath}`),
            name: entry.name.replace(/\.rfxchain$/i, ""),
            path: absolutePath,
            source,
          });
        }
      }
    };

    collect(path.join(REAPER_RESOURCE_DIR, "FXChains"), "reaper");
    collect(MANAGED_FXCHAINS_DIR, "managed");

    return candidates.sort((left, right) => left.name.localeCompare(right.name));
  }

  async createProfile(input: ProfileInput) {
    const name = input.name.trim();

    if (!name) {
      throw new Error("Profile name is required.");
    }

    const createdAt = nowIso();
    let fxChainPath: string | null = null;
    let importedFxChainPath: string | null = null;

    if (input.fxChainSourcePath?.trim()) {
      const sourcePath = input.fxChainSourcePath.trim();

      if (!existsSync(sourcePath)) {
        throw new Error("FX chain file does not exist.");
      }

      if (!sourcePath.toLowerCase().endsWith(".rfxchain")) {
        throw new Error("FX chain must be a .RfxChain file.");
      }

      if (input.copyToManagedStore ?? true) {
        const targetName = `${slugify(name)}-${randomUUID().slice(0, 8)}.RfxChain`;
        importedFxChainPath = path.join(MANAGED_FXCHAINS_DIR, targetName);
        await copyFile(sourcePath, importedFxChainPath);
        fxChainPath = importedFxChainPath;
      } else {
        fxChainPath = sourcePath;
      }
    }

    const profile: RenderProfile = {
      id: randomUUID(),
      name,
      fxChainPath,
      importedFxChainPath,
      notes: input.notes?.trim() ?? "",
      createdAt,
      updatedAt: createdAt,
    };

    this.profiles = [profile, ...this.profiles];
    this.saveProfiles();
    this.log(`Profile created: ${profile.name}${profile.fxChainPath ? ` -> ${profile.fxChainPath}` : " (dry)"}`);
    this.emitState();
    return profile;
  }

  async updateProfile(profileId: string, input: ProfileUpdateInput) {
    const target = this.profiles.find((profile) => profile.id === profileId);

    if (!target) {
      throw new Error("Profile not found.");
    }

    const nextName = input.name?.trim() || target.name;
    const nextNotes = input.notes?.trim() ?? target.notes;
    const shouldClearFxChain = input.clearFxChain === true;
    let nextFxChainPath = target.fxChainPath;
    let nextImportedFxChainPath = target.importedFxChainPath;

    if (!nextName) {
      throw new Error("Profile name is required.");
    }

    if (shouldClearFxChain) {
      if (target.importedFxChainPath && existsSync(target.importedFxChainPath)) {
        rmSync(target.importedFxChainPath);
      }

      nextFxChainPath = null;
      nextImportedFxChainPath = null;
    } else if (typeof input.fxChainSourcePath === "string") {
      const sourcePath = input.fxChainSourcePath.trim();

      if (!sourcePath) {
        if (target.importedFxChainPath && existsSync(target.importedFxChainPath)) {
          rmSync(target.importedFxChainPath);
        }

        nextFxChainPath = null;
        nextImportedFxChainPath = null;
      } else {
        if (!existsSync(sourcePath)) {
          throw new Error("FX chain file does not exist.");
        }

        if (!sourcePath.toLowerCase().endsWith(".rfxchain")) {
          throw new Error("FX chain must be a .RfxChain file.");
        }

        if (target.importedFxChainPath && target.importedFxChainPath !== sourcePath && existsSync(target.importedFxChainPath)) {
          rmSync(target.importedFxChainPath);
        }

        if (input.copyToManagedStore ?? true) {
          const targetName = `${slugify(nextName)}-${randomUUID().slice(0, 8)}.RfxChain`;
          nextImportedFxChainPath = path.join(MANAGED_FXCHAINS_DIR, targetName);
          await copyFile(sourcePath, nextImportedFxChainPath);
          nextFxChainPath = nextImportedFxChainPath;
        } else {
          nextImportedFxChainPath = null;
          nextFxChainPath = sourcePath;
        }
      }
    }

    const updatedProfile: RenderProfile = {
      ...target,
      name: nextName,
      notes: nextNotes,
      fxChainPath: nextFxChainPath,
      importedFxChainPath: nextImportedFxChainPath,
      updatedAt: nowIso(),
    };

    this.profiles = this.profiles.map((profile) => (profile.id === profileId ? updatedProfile : profile));
    this.saveProfiles();
    this.log(`Profile updated: ${updatedProfile.name}`);
    this.emitState();
    return updatedProfile;
  }

  deleteProfile(profileId: string) {
    const target = this.profiles.find((profile) => profile.id === profileId);

    if (!target) {
      throw new Error("Profile not found.");
    }

    if (this.profiles.length === 1) {
      throw new Error("At least one render profile must remain.");
    }

    if (this.jobs.some((job) => job.profileId === profileId && (job.status === "queued" || job.status === "processing"))) {
      throw new Error("Profile is still referenced by queued or active jobs.");
    }

    if (target.importedFxChainPath && existsSync(target.importedFxChainPath)) {
      rmSync(target.importedFxChainPath);
    }

    this.profiles = this.profiles.filter((profile) => profile.id !== profileId);
    this.savedSettings = this.savedSettings.filter((settings) => settings.profileId !== profileId);
    this.saveProfiles();
    this.saveSavedSettings();
    this.log(`Profile deleted: ${target.name}`);
    this.emitState();
  }

  addJob(input: JobInput) {
    const inputPath = input.inputPath.trim();
    const outputPath = input.outputPath.trim();
    const profile = this.profiles.find((entry) => entry.id === input.profileId);

    if (!profile) {
      throw new Error("Profile not found.");
    }

    if (!inputPath) {
      throw new Error("Input file path is required.");
    }

    if (!outputPath) {
      throw new Error("Output file path is required.");
    }

    if (!existsSync(inputPath)) {
      throw new Error("Input file does not exist.");
    }

    if (inputPath === outputPath) {
      throw new Error("Input and output paths must be different.");
    }

    const job: BatchJob = {
      id: randomUUID(),
      profileId: profile.id,
      profileName: profile.name,
      inputPath,
      outputPath,
      status: "queued",
      progress: 0,
      currentStep: "Queued",
      errorMessage: "",
      startedAt: null,
      completedAt: null,
      splashLogPath: null,
      stderrLogPath: null,
    };

    this.jobs = [...this.jobs, job];
    this.saveJobs();
    this.refreshEngineCounters();
    this.log(`Queued job ${job.id}: ${job.inputPath} -> ${job.outputPath} [${job.profileName}]`);
    this.emitState();
    return job;
  }

  addJobsBatch(input: BatchJobInput) {
    const profile = this.profiles.find((entry) => entry.id === input.profileId);
    const outputDirectory = input.outputDirectory?.trim() ?? "";
    const normalizedInputs = Array.from(new Set(input.inputPaths.map((entry) => entry.trim()).filter(Boolean)));

    if (!profile) {
      throw new Error("Profile not found.");
    }

    if (normalizedInputs.length === 0) {
      throw new Error("At least one input file is required.");
    }

    if (outputDirectory && !path.isAbsolute(outputDirectory)) {
      throw new Error("Output directory must be an absolute path.");
    }

    const usedOutputs = new Set<string>();
    const jobs = normalizedInputs.map((inputPath) => {
      const outputPath = ensureUniqueOutputPath(
        buildOutputPathForInput(inputPath, profile.name, { outputBaseDirectory: outputDirectory || undefined }),
        usedOutputs,
      );

      return this.addJob({
        profileId: profile.id,
        inputPath,
        outputPath,
      });
    });

    this.log(`Queued ${jobs.length} jobs in batch for profile ${profile.name}.`);
    return jobs;
  }

  queueFolderJobs(input: FolderJobInput) {
    const profile = this.profiles.find((entry) => entry.id === input.profileId);
    const inputDirectory = input.inputDirectory.trim();
    const outputBaseDirectory = input.outputBaseDirectory?.trim() ?? "";
    const recursive = input.recursive ?? false;

    if (!profile) {
      throw new Error("Profile not found.");
    }

    if (!inputDirectory) {
      throw new Error("Input folder is required.");
    }

    if (!path.isAbsolute(inputDirectory)) {
      throw new Error("Input folder must be an absolute path.");
    }

    if (!existsSync(inputDirectory) || !statSync(inputDirectory).isDirectory()) {
      throw new Error("Input folder does not exist.");
    }

    if (outputBaseDirectory && !path.isAbsolute(outputBaseDirectory)) {
      throw new Error("Output base folder must be an absolute path.");
    }

    const resolvedInputDirectory = path.resolve(inputDirectory);
    const resolvedOutputBaseDirectory = outputBaseDirectory ? path.resolve(outputBaseDirectory) : "";
    const profileOutputRoot = path.resolve(resolvedOutputBaseDirectory || resolvedInputDirectory, sanitizePathSegment(profile.name));
    const excludedDirectories = new Set<string>();

    if (profileOutputRoot === resolvedInputDirectory || profileOutputRoot.startsWith(`${resolvedInputDirectory}${path.sep}`)) {
      excludedDirectories.add(profileOutputRoot);
    }

    const wavFiles = collectWavFiles(resolvedInputDirectory, recursive, excludedDirectories);

    if (wavFiles.length === 0) {
      throw new Error("No WAV files were found in the input folder.");
    }

    const usedOutputs = new Set<string>();
    const jobs = wavFiles.map((inputPath) => {
      const outputPath = ensureUniqueOutputPath(
        buildOutputPathForInput(inputPath, profile.name, {
          outputBaseDirectory: resolvedOutputBaseDirectory || undefined,
          inputRootDirectory: resolvedInputDirectory,
        }),
        usedOutputs,
      );

      return this.addJob({
        profileId: profile.id,
        inputPath,
        outputPath,
      });
    });

    this.log(`Queued ${jobs.length} folder jobs from ${resolvedInputDirectory} using profile ${profile.name}.`);
    return jobs;
  }

  createSavedSettings(input: SavedSettingsInput) {
    const normalized = this.normalizeSavedSettingsInput(input);
    const createdAt = nowIso();
    const savedSettings: SavedBatchSettings = {
      id: randomUUID(),
      ...normalized,
      createdAt,
      updatedAt: createdAt,
    };

    this.savedSettings = [savedSettings, ...this.savedSettings];
    this.saveSavedSettings();
    this.log(`Saved settings created: ${savedSettings.name}`);
    this.emitState();
    return savedSettings;
  }

  updateSavedSettings(settingsId: string, input: SavedSettingsUpdateInput) {
    const target = this.savedSettings.find((settings) => settings.id === settingsId);

    if (!target) {
      throw new Error("Saved settings not found.");
    }

    const normalized = this.normalizeSavedSettingsInput({
      name: input.name ?? target.name,
      profileId: input.profileId ?? target.profileId,
      inputDirectory: input.inputDirectory ?? target.inputDirectory,
      outputBaseDirectory: input.outputBaseDirectory ?? target.outputBaseDirectory,
      recursive: input.recursive ?? target.recursive,
    });

    const updated: SavedBatchSettings = {
      ...target,
      ...normalized,
      updatedAt: nowIso(),
    };

    this.savedSettings = this.savedSettings.map((settings) => (settings.id === settingsId ? updated : settings));
    this.saveSavedSettings();
    this.log(`Saved settings updated: ${updated.name}`);
    this.emitState();
    return updated;
  }

  deleteSavedSettings(settingsId: string) {
    const target = this.savedSettings.find((settings) => settings.id === settingsId);

    if (!target) {
      throw new Error("Saved settings not found.");
    }

    this.savedSettings = this.savedSettings.filter((settings) => settings.id !== settingsId);
    this.saveSavedSettings();
    this.log(`Saved settings deleted: ${target.name}`);
    this.emitState();
  }

  clearFinishedJobs() {
    this.jobs = this.jobs.filter((job) => job.status === "queued" || job.status === "processing");
    this.saveJobs();
    this.refreshEngineCounters();
    this.log("Cleared finished jobs.");
    this.emitState();
  }

  removeJob(jobId: string) {
    const job = this.mustGetJob(jobId);

    if (job.status === "processing") {
      throw new Error("Processing jobs cannot be removed.");
    }

    const runRoot = path.join(RUNS_DIR, job.id);

    if (existsSync(runRoot)) {
      rmSync(runRoot, { recursive: true, force: true });
    }

    this.jobs = this.jobs.filter((entry) => entry.id !== jobId);
    this.saveJobs();
    this.refreshEngineCounters();
    this.log(`Removed job ${job.id}.`);
    this.emitState();
  }

  retryJob(jobId: string) {
    const sourceJob = this.mustGetJob(jobId);

    if (sourceJob.status === "processing") {
      throw new Error("Processing jobs cannot be retried.");
    }

    const queuedJob = this.addJob({
      profileId: sourceJob.profileId,
      inputPath: sourceJob.inputPath,
      outputPath: sourceJob.outputPath,
    });

    this.log(`Retried job ${sourceJob.id} as ${queuedJob.id}.`);
    return queuedJob;
  }

  async startBatch() {
    this.refreshEnvironment(false);

    if (!this.reaperInfo.available) {
      throw new Error("REAPER binary was not found.");
    }

    if (this.engine.running) {
      return false;
    }

    if (!this.jobs.some((job) => job.status === "queued")) {
      throw new Error("No queued jobs are available.");
    }

    this.cancelRequested = false;
    this.engine.running = true;
    this.engine.cancelling = false;
    this.engine.startedAt = nowIso();
    this.engine.finishedAt = null;
    this.refreshEngineCounters();
    this.emitState();
    this.log("Batch started.");

    this.runPromise = this.runLoop().finally(() => {
      this.engine.running = false;
      this.engine.cancelling = false;
      this.engine.currentJobId = "";
      this.engine.finishedAt = nowIso();
      this.refreshEngineCounters();
      this.emitState();
      this.log("Batch finished.");
      this.runPromise = null;
    });

    return true;
  }

  async cancelBatch() {
    if (!this.engine.running) {
      return false;
    }

    this.cancelRequested = true;
    this.engine.cancelling = true;
    this.emitState();
    this.log("Batch cancellation requested.");

    if (this.currentChild) {
      this.currentChild.kill("SIGTERM");
    }

    return true;
  }

  refreshEnvironment(emitLog = true) {
    this.reaperInfo = this.detectReaper();

    if (emitLog) {
      this.log(
        `Environment refreshed. REAPER ${this.reaperInfo.available ? "detected" : "missing"} at ${this.reaperInfo.binaryPath}`,
      );
    }

    this.emitState();
    return this.reaperInfo;
  }

  private async runLoop() {
    while (true) {
      const nextJob = this.jobs.find((job) => job.status === "queued");

      if (!nextJob || this.cancelRequested) {
        break;
      }

      const profile = this.profiles.find((entry) => entry.id === nextJob.profileId);

      if (!profile) {
        this.updateJob(nextJob.id, {
          status: "error",
          errorMessage: "Profile no longer exists.",
          currentStep: "Profile missing",
          completedAt: nowIso(),
        });
        continue;
      }

      await this.runJob(nextJob.id, profile);
    }
  }

  private async runJob(jobId: string, profile: RenderProfile) {
    const job = this.mustGetJob(jobId);
    const runRoot = path.join(RUNS_DIR, job.id);

    ensureDir(runRoot);

    const batchFilePath = path.join(runRoot, "batchconvert.txt");
    const splashLogPath = path.join(runRoot, "reaper-splash.log");
    const stderrLogPath = path.join(runRoot, "reaper-stderr.log");

    if (existsSync(splashLogPath)) {
      rmSync(splashLogPath);
    }

    if (existsSync(stderrLogPath)) {
      rmSync(stderrLogPath);
    }

    if (existsSync(job.outputPath)) {
      rmSync(job.outputPath);
    }

    ensureDir(path.dirname(job.outputPath));

    const batchFile = this.buildBatchConvertFile(job.inputPath, job.outputPath, profile.fxChainPath);
    writeFileSync(batchFilePath, batchFile, "utf8");

    this.updateJob(job.id, {
      status: "processing",
      progress: 0.05,
      currentStep: "Launching REAPER",
      errorMessage: "",
      startedAt: nowIso(),
      completedAt: null,
      splashLogPath,
      stderrLogPath,
    });

    this.engine.currentJobId = job.id;
    this.refreshEngineCounters();
    this.emitState();
    this.log(`Starting job ${job.id} with profile ${profile.name}.`);
    this.log(`REAPER command: ${this.reaperInfo.binaryPath} -batchconvert ${batchFilePath} -nosplash -splashlog ${splashLogPath}`);

    const child = spawn(
      this.reaperInfo.binaryPath,
      ["-batchconvert", batchFilePath, "-nosplash", "-splashlog", splashLogPath],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    this.currentChild = child;
    const stderrLines: string[] = [];

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderrLines.push(chunk);
      writeFileSync(stderrLogPath, stderrLines.join(""), "utf8");
    });

    let splashCursor = 0;
    let splashCarry = "";
    let lastOutputSize = 0;
    const poller = setInterval(async () => {
      splashCursor = await this.readNewSplashLogLines(splashLogPath, splashCursor, (line) => {
        splashCarry = this.consumeSplashLine(line, splashCarry, job.id);
      });

      if (existsSync(job.outputPath)) {
        const currentSize = statSync(job.outputPath).size;

        if (currentSize > 0 && currentSize !== lastOutputSize) {
          lastOutputSize = currentSize;
          this.bumpJobProgress(job.id, 0.9, "Writing output");
        }
      }
    }, 250);

    const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    }).catch((error: Error) => ({ code: 1, signal: null, error })) as { code: number | null; signal: NodeJS.Signals | null; error?: Error };

    clearInterval(poller);
    splashCursor = await this.readNewSplashLogLines(splashLogPath, splashCursor, (line) => {
      splashCarry = this.consumeSplashLine(line, splashCarry, job.id);
    });

    if (splashCarry.trim()) {
      this.log(`[reaper][${job.id}] ${splashCarry.trim()}`);
    }

    this.currentChild = null;

    if (this.cancelRequested) {
      this.updateJob(job.id, {
        status: "cancelled",
        progress: 0,
        currentStep: "Cancelled",
        errorMessage: "Batch cancelled by user.",
        completedAt: nowIso(),
      });
      return;
    }

    if (exitResult.error) {
      this.updateJob(job.id, {
        status: "error",
        progress: 0,
        currentStep: "Launch failed",
        errorMessage: exitResult.error.message,
        completedAt: nowIso(),
      });
      this.log(`Job ${job.id} failed to launch: ${exitResult.error.message}`);
      return;
    }

    if ((exitResult.code ?? 0) !== 0 || !existsSync(job.outputPath)) {
      const exitText = `code=${exitResult.code ?? "null"} signal=${exitResult.signal ?? "null"}`;
      this.updateJob(job.id, {
        status: "error",
        progress: 0,
        currentStep: "Render failed",
        errorMessage: `REAPER did not produce output (${exitText}).`,
        completedAt: nowIso(),
      });
      this.log(`Job ${job.id} failed: ${exitText}`);
      return;
    }

    this.updateJob(job.id, {
      status: "done",
      progress: 1,
      currentStep: "Completed",
      errorMessage: "",
      completedAt: nowIso(),
    });
    this.log(`Job ${job.id} completed.`);
  }

  private buildBatchConvertFile(inputPath: string, outputPath: string, fxChainPath: string | null) {
    const lines = [`${inputPath}\t${outputPath}`, "<CONFIG"];

    if (fxChainPath) {
      lines.push(`  FXCHAIN '${fxChainPath.replace(/'/g, "'\\''")}'`);
    }

    lines.push("  USESRCSTART 1");
    lines.push("  USESRCMETADATA 1");
    lines.push(">");

    return `${lines.join("\n")}\n`;
  }

  private async readNewSplashLogLines(filePath: string, cursor: number, onChunk: (text: string) => void) {
    if (!existsSync(filePath)) {
      return cursor;
    }

    const handle = await open(filePath, "r");

    try {
      const { size } = await handle.stat();

      if (size <= cursor) {
        return cursor;
      }

      const length = size - cursor;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, cursor);
      onChunk(buffer.toString("utf8"));
      return size;
    } finally {
      await handle.close();
    }
  }

  private consumeSplashLine(chunk: string, carry: string, jobId: string) {
    const parts = `${carry}${chunk}`.split(/\r?\n/);
    const nextCarry = parts.pop() ?? "";

    for (const rawLine of parts) {
      const line = rawLine.trim();

      if (!line) {
        continue;
      }

      this.log(`[reaper][${jobId}] ${line}`);
      this.maybeAdvanceJobProgress(jobId, line);
    }

    return nextCarry;
  }

  private maybeAdvanceJobProgress(jobId: string, line: string) {
    if (line.includes("Loading Configuration")) {
      this.bumpJobProgress(jobId, 0.1, "Loading REAPER configuration");
      return;
    }

    if (line.includes("Scanning VST plug-ins")) {
      this.bumpJobProgress(jobId, 0.2, "Scanning VST plug-ins");
      return;
    }

    if (line.includes("Initializing Main Window")) {
      this.bumpJobProgress(jobId, 0.55, "Preparing render engine");
      return;
    }

    if (line.includes("Loading native plug-ins")) {
      this.bumpJobProgress(jobId, 0.7, "Loading REAPER native plug-ins");
    }
  }

  private bumpJobProgress(jobId: string, progress: number, step: string) {
    const job = this.mustGetJob(jobId);

    if (progress <= job.progress) {
      return;
    }

    this.updateJob(jobId, { progress, currentStep: step });
  }

  private updateJob(jobId: string, patch: Partial<BatchJob>) {
    this.jobs = this.jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job));
    this.saveJobs();
    this.refreshEngineCounters();
    this.emitState();
  }

  private mustGetJob(jobId: string) {
    const job = this.jobs.find((entry) => entry.id === jobId);

    if (!job) {
      throw new Error(`Unknown job: ${jobId}`);
    }

    return job;
  }

  private emitState() {
    this.events.emit("state", this.getStatePayload());
  }

  private log(line: string) {
    const timestamped = `[${new Date().toLocaleTimeString("ja-JP", { hour12: false })}] ${line}`;
    this.logs = [...this.logs, timestamped].slice(-500);
    writeFileSync(ENGINE_LOG_PATH, `${this.logs.join("\n")}\n`, "utf8");
    this.events.emit("log", timestamped);
  }

  private saveProfiles() {
    writeJsonFile(PROFILES_PATH, this.profiles);
  }

  private saveSavedSettings() {
    writeJsonFile(SAVED_SETTINGS_PATH, this.savedSettings);
  }

  private saveJobs() {
    writeJsonFile(JOBS_PATH, this.jobs);
  }

  private refreshEngineCounters() {
    this.engine.totalJobs = this.jobs.length;
    this.engine.completedJobs = this.jobs.filter((job) => job.status === "done").length;
    this.engine.failedJobs = this.jobs.filter((job) => job.status === "error" || job.status === "cancelled").length;
    this.engine.queuedJobs = this.jobs.filter((job) => job.status === "queued").length;
  }

  private readLogTail(filePath: string, maxLines: number) {
    if (!existsSync(filePath)) {
      return [];
    }

    return readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-maxLines);
  }

  private detectReaper(): ReaperInfo {
    const infoPlistPath = "/Applications/REAPER.app/Contents/Info.plist";
    let version = "Unknown";

    if (existsSync(infoPlistPath)) {
      const plistResult = spawnSync("plutil", ["-convert", "json", "-o", "-", infoPlistPath], {
        encoding: "utf8",
      });

      if (plistResult.status === 0 && plistResult.stdout) {
        try {
          const plist = JSON.parse(plistResult.stdout) as { CFBundleShortVersionString?: string };
          version = plist.CFBundleShortVersionString?.trim() || "Installed";
        } catch {
          version = "Installed";
        }
      } else {
        version = "Installed";
      }
    }

    return {
      available: existsSync(REAPER_BINARY),
      binaryPath: REAPER_BINARY,
      resourceDir: REAPER_RESOURCE_DIR,
      fxChainsDir: path.join(REAPER_RESOURCE_DIR, "FXChains"),
      appDataDir: APP_DATA_DIR,
      version,
    };
  }

  private normalizeSavedSettingsInput(input: SavedSettingsInput) {
    const profile = this.profiles.find((entry) => entry.id === input.profileId);
    const name = input.name.trim();
    const inputDirectory = input.inputDirectory.trim();
    const outputBaseDirectory = input.outputBaseDirectory?.trim() ?? "";

    if (!profile) {
      throw new Error("Profile not found.");
    }

    if (!name) {
      throw new Error("Settings name is required.");
    }

    if (!inputDirectory) {
      throw new Error("Input folder is required.");
    }

    if (!path.isAbsolute(inputDirectory)) {
      throw new Error("Input folder must be an absolute path.");
    }

    if (outputBaseDirectory && !path.isAbsolute(outputBaseDirectory)) {
      throw new Error("Output base folder must be an absolute path.");
    }

    return {
      name,
      profileId: profile.id,
      inputDirectory,
      outputBaseDirectory,
      recursive: input.recursive ?? false,
    };
  }
}
