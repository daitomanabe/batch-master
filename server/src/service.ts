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
  PluginCatalogState,
  PluginEditorSession,
  PluginInfo,
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
  outputFolderName?: string;
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

type PluginSelectionInput = {
  pluginId: string;
  pluginName: string;
  pluginVendor?: string;
  pluginFormat?: PluginInfo["format"] | "";
};

type SimpleBatchInput = {
  profileName?: string;
  fxChainSourcePath: string;
  inputDirectory: string;
  recursive?: boolean;
};

const REAPER_BINARY = process.env.BM_REAPER_PATH ?? "/Applications/REAPER.app/Contents/MacOS/REAPER";
const REAPER_RESOURCE_DIR = path.join(os.homedir(), "Library/Application Support/REAPER");
const APP_DATA_DIR = path.join(os.homedir(), "Library/Application Support/BatchMaster");
const MANAGED_FXCHAINS_DIR = path.join(APP_DATA_DIR, "fxchains");
const EDITOR_SESSIONS_DIR = path.join(APP_DATA_DIR, "editor-sessions");
const RUNS_DIR = path.join(APP_DATA_DIR, "runs");
const LOGS_DIR = path.join(APP_DATA_DIR, "logs");
const PROFILES_PATH = path.join(APP_DATA_DIR, "profiles.json");
const SAVED_SETTINGS_PATH = path.join(APP_DATA_DIR, "saved-settings.json");
const PLUGIN_CACHE_PATH = path.join(APP_DATA_DIR, "plugin-cache.json");
const EDITOR_SESSIONS_PATH = path.join(APP_DATA_DIR, "editor-sessions.json");
const JOBS_PATH = path.join(APP_DATA_DIR, "jobs.json");
const ENGINE_LOG_PATH = path.join(LOGS_DIR, "engine.log");

type StoredPluginCatalog = {
  plugins: PluginInfo[];
  lastUpdatedAt: string | null;
};

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

function formatRenderTimestamp(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");

  return [
    date.getFullYear().toString(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
}

function buildRenderFolderName(baseName: string, date: Date) {
  return `${sanitizePathSegment(baseName)}-r${formatRenderTimestamp(date)}`;
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

function collectWavFiles(
  directory: string,
  recursive: boolean,
  excludedDirectories: Set<string> = new Set(),
  excludedDirectoryNamePrefixes: string[] = [],
) {
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
        const normalizedEntryName = sanitizePathSegment(entry.name);

        if (!recursive && current === resolvedRoot) {
          continue;
        }

        if (
          recursive &&
          !excludedDirectories.has(resolvedPath) &&
          !excludedDirectoryNamePrefixes.some((prefix) => normalizedEntryName === prefix || normalizedEntryName.startsWith(`${prefix}-r`))
        ) {
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

function normalizePluginDisplayName(displayName: string) {
  const instrument = displayName.includes("!!!VSTi");
  let cleaned = displayName.replace(/!!!VSTi/g, "").trim();

  cleaned = cleaned.replace(/\(\d+\s*out\)$/i, "").trim();
  cleaned = cleaned.replace(/\(\d+->\d+ch\)$/i, "").trim();

  const matches = [...cleaned.matchAll(/\(([^()]+)\)/g)];
  const vendor = matches.length > 0 ? matches[matches.length - 1][1].trim() : "";

  return {
    name: cleaned,
    vendor,
    instrument,
  };
}

function parseVstPlugins(filePath: string) {
  if (!existsSync(filePath)) {
    return [] as PluginInfo[];
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const plugins: PluginInfo[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("[")) {
      inSection = line.toLowerCase() === "[vstcache]";
      continue;
    }

    if (!inSection) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const fileName = line.slice(0, separatorIndex).trim();
    const payload = line.slice(separatorIndex + 1).trim();
    const parts = payload.split(",");
    const displayName = parts.slice(2).join(",").trim();

    if (!fileName || !displayName) {
      continue;
    }

    const normalized = normalizePluginDisplayName(displayName);

    plugins.push({
      id: buildId(`vst:${fileName}:${normalized.name}`),
      name: normalized.name,
      vendor: normalized.vendor,
      format: fileName.toLowerCase().endsWith(".vst3") ? "VST3" : "VST",
      instrument: normalized.instrument,
      sourceFile: path.basename(filePath),
    });
  }

  return plugins;
}

function parseAuPlugins(filePath: string) {
  if (!existsSync(filePath)) {
    return [] as PluginInfo[];
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const plugins: PluginInfo[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("[")) {
      inSection = line.toLowerCase() === "[auplugins]";
      continue;
    }

    if (!inSection) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const left = line.slice(0, separatorIndex).trim();
    const right = line.slice(separatorIndex + 1).trim();
    const vendorSeparator = left.indexOf(":");
    const vendor = vendorSeparator >= 0 ? left.slice(0, vendorSeparator).trim() : "";
    const name = vendorSeparator >= 0 ? left.slice(vendorSeparator + 1).trim() : left;

    plugins.push({
      id: buildId(`au:${left}`),
      name,
      vendor,
      format: "AU",
      instrument: right === "<inst>",
      sourceFile: path.basename(filePath),
    });
  }

  return plugins;
}

function parseClapPlugins(filePath: string) {
  if (!existsSync(filePath)) {
    return [] as PluginInfo[];
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const plugins: PluginInfo[] = [];
  let currentSection = "";
  let captured = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).trim();
      captured = false;
      continue;
    }

    if (!currentSection || captured || line.startsWith("_=")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const payload = line.slice(separatorIndex + 1);
    const pipeIndex = payload.indexOf("|");

    if (pipeIndex < 0) {
      continue;
    }

    const instrumentFlag = payload.slice(0, pipeIndex).trim();
    const displayName = payload.slice(pipeIndex + 1).trim();
    const normalized = normalizePluginDisplayName(displayName);

    plugins.push({
      id: buildId(`clap:${currentSection}:${normalized.name}`),
      name: normalized.name,
      vendor: normalized.vendor,
      format: "CLAP",
      instrument: instrumentFlag === "1",
      sourceFile: path.basename(filePath),
    });

    captured = true;
  }

  return plugins;
}

function escapeAppleScriptString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeLuaString(value: string) {
  return JSON.stringify(value);
}

function runAppleScript(lines: string[]) {
  const result = spawnSync(
    "osascript",
    lines.flatMap((line) => ["-e", line]),
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    const errorText = result.stderr?.trim() || result.stdout?.trim() || "AppleScript command failed.";
    throw new Error(errorText);
  }

  return result.stdout.trim();
}

export class BatchMasterService {
  private readonly events = new EventStream();
  private reaperInfo: ReaperInfo;
  private profiles: RenderProfile[];
  private savedSettings: SavedBatchSettings[];
  private pluginCatalog: PluginCatalogState;
  private editorSessions: PluginEditorSession[];
  private jobs: BatchJob[];
  private logs: string[];
  private engine = { ...EMPTY_ENGINE_STATE };
  private currentChild: ChildProcess | null = null;
  private cancelRequested = false;
  private runPromise: Promise<void> | null = null;

  constructor() {
    ensureDir(APP_DATA_DIR);
    ensureDir(MANAGED_FXCHAINS_DIR);
    ensureDir(EDITOR_SESSIONS_DIR);
    ensureDir(RUNS_DIR);
    ensureDir(LOGS_DIR);

    this.reaperInfo = this.detectReaper();
    this.profiles = readJsonFile<RenderProfile[]>(PROFILES_PATH, []);
    this.savedSettings = readJsonFile<SavedBatchSettings[]>(SAVED_SETTINGS_PATH, []);
    this.pluginCatalog = this.loadPluginCatalog();
    this.editorSessions = readJsonFile<PluginEditorSession[]>(EDITOR_SESSIONS_PATH, []).map((session) => this.syncEditorSession(session));
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
      pluginCatalog: this.pluginCatalog,
      editorSessions: this.editorSessions,
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
      pluginCatalog: this.pluginCatalog,
      editorSessions: this.editorSessions,
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
    collect(EDITOR_SESSIONS_DIR, "session");

    return candidates.sort((left, right) => left.name.localeCompare(right.name));
  }

  async openPluginEditorSession(input: PluginSelectionInput & { fxChainSourcePath?: string }) {
    this.refreshEnvironment(false);

    if (!this.reaperInfo.available) {
      throw new Error("REAPER binary was not found.");
    }

    const plugin = this.normalizePluginSelectionInput(input);
    const session = this.getOrCreateEditorSession(plugin);
    const projectExists = existsSync(session.projectPath);
    const script = this.buildEditorLaunchScript({
      plugin,
      projectPath: session.projectPath,
      fxChainSourcePath: projectExists ? "" : input.fxChainSourcePath?.trim() ?? "",
      initializeProject: !projectExists,
    });

    writeFileSync(session.launchScriptPath, script, "utf8");

    const args = projectExists
      ? ["-newinst", "-nosplash", session.projectPath, session.launchScriptPath]
      : ["-newinst", "-nosplash", "-new", session.launchScriptPath];

    const child = spawn(this.reaperInfo.binaryPath, args, {
      detached: true,
      stdio: "ignore",
    });

    child.unref();

    if (!projectExists) {
      await this.waitForPath(session.projectPath, 10000);
    }

    const updatedSession = this.upsertEditorSession({
      ...session,
      touchedAt: nowIso(),
      hasProject: existsSync(session.projectPath),
      hasFxChain: existsSync(session.fxChainPath),
    });

    this.log(
      `Opened plugin editor for ${plugin.pluginName}${projectExists ? " (existing session)" : ""} at ${updatedSession.projectPath}`,
    );
    this.emitState();
    return updatedSession;
  }

  capturePluginEditorSession(input: PluginSelectionInput) {
    const plugin = this.normalizePluginSelectionInput(input);
    const session = this.getOrCreateEditorSession(plugin);

    if (!existsSync(session.projectPath)) {
      throw new Error("Plugin editor session project does not exist yet. Open the editor first.");
    }

    const fxChainBlock = this.extractFirstFxChainBlock(session.projectPath);

    if (!fxChainBlock) {
      throw new Error("No FX chain was found in the editor session. Save the project in REAPER and try again.");
    }

    writeFileSync(session.fxChainPath, `${fxChainBlock}\n`, "utf8");

    const updatedSession = this.upsertEditorSession({
      ...session,
      touchedAt: nowIso(),
      hasProject: true,
      hasFxChain: true,
    });

    this.log(`Captured editor settings for ${plugin.pluginName} -> ${updatedSession.fxChainPath}`);
    this.emitState();
    return updatedSession;
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
    const outputFolderName = input.outputFolderName?.trim() || profile?.name || "";
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

    if (!outputFolderName) {
      throw new Error("Output folder name is required.");
    }

    const resolvedInputDirectory = path.resolve(inputDirectory);
    const resolvedOutputBaseDirectory = outputBaseDirectory ? path.resolve(outputBaseDirectory) : "";
    const sanitizedOutputFolderName = sanitizePathSegment(outputFolderName);
    const sanitizedProfileName = sanitizePathSegment(profile.name);
    const profileOutputRoot = path.resolve(resolvedOutputBaseDirectory || resolvedInputDirectory, sanitizedOutputFolderName);
    const excludedDirectories = new Set<string>();

    if (profileOutputRoot === resolvedInputDirectory || profileOutputRoot.startsWith(`${resolvedInputDirectory}${path.sep}`)) {
      excludedDirectories.add(profileOutputRoot);
    }

    const wavFiles = collectWavFiles(resolvedInputDirectory, recursive, excludedDirectories, [
      sanitizedProfileName,
      sanitizedOutputFolderName,
    ]);

    if (wavFiles.length === 0) {
      throw new Error("No WAV files were found in the input folder.");
    }

    const usedOutputs = new Set<string>();
    const jobs = wavFiles.map((inputPath) => {
      const outputPath = ensureUniqueOutputPath(
        buildOutputPathForInput(inputPath, outputFolderName, {
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

    this.log(`Queued ${jobs.length} folder jobs from ${resolvedInputDirectory} into ${profileOutputRoot}.`);
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

  async runSimpleFolderBatch(input: SimpleBatchInput) {
    if (this.engine.running) {
      throw new Error("Batch is already running.");
    }

    const fxChainSourcePath = input.fxChainSourcePath?.trim() ?? "";
    const inputDirectory = input.inputDirectory.trim();
    const derivedProfileName = fxChainSourcePath
      ? path.basename(fxChainSourcePath, path.extname(fxChainSourcePath)).trim()
      : "";
    const profileName = input.profileName?.trim() || derivedProfileName;
    const outputFolderName = profileName ? buildRenderFolderName(profileName, new Date()) : "";

    if (!inputDirectory) {
      throw new Error("Input folder is required.");
    }

    if (!fxChainSourcePath) {
      throw new Error("Choose a .RfxChain file before batch export.");
    }

    if (!profileName) {
      throw new Error("Could not determine the output folder name from the .RfxChain file.");
    }

    this.jobs = [];
    this.saveJobs();
    this.refreshEngineCounters();
    this.emitState();

    const existingProfile = this.profiles.find((profile) => profile.name === profileName);
    let profile: RenderProfile;

    if (existingProfile) {
      profile = await this.updateProfile(existingProfile.id, {
        name: profileName,
        fxChainSourcePath,
        copyToManagedStore: true,
        notes: `Auto-generated profile for ${profileName}`,
      });
    } else {
      profile = await this.createProfile({
        name: profileName,
        fxChainSourcePath,
        copyToManagedStore: true,
        notes: `Auto-generated profile for ${profileName}`,
      });
    }

    const queuedJobs = this.queueFolderJobs({
      profileId: profile.id,
      inputDirectory,
      outputBaseDirectory: path.dirname(path.resolve(inputDirectory)),
      outputFolderName,
      recursive: input.recursive ?? true,
    });

    await this.startBatch();

    return {
      started: true,
      queuedJobs: queuedJobs.length,
      profile,
    };
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

  refreshPluginCatalog() {
    this.pluginCatalog = this.scanPluginCatalog();
    this.emitState();
    this.log(`Plugin catalog refreshed: ${this.pluginCatalog.plugins.length} plugins.`);
    return this.pluginCatalog;
  }

  chooseFilePaths(prompt: string, multiple = false, allowedExtensions: string[] = []) {
    const sanitizedPrompt = escapeAppleScriptString(prompt);
    const typeList =
      allowedExtensions.length > 0
        ? ` of type {${allowedExtensions.map((extension) => `"${escapeAppleScriptString(extension)}"`).join(", ")}}`
        : "";

    if (multiple) {
      const output = runAppleScript([
        "try",
        `set chosenItems to choose file with prompt "${sanitizedPrompt}" with multiple selections allowed${typeList}`,
        "set outputText to \"\"",
        "repeat with chosenItem in chosenItems",
        "set outputText to outputText & POSIX path of chosenItem & linefeed",
        "end repeat",
        "return outputText",
        "on error number -128",
        "return \"\"",
        "end try",
      ]);

      return output.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    }

    const output = runAppleScript([
      "try",
      `return POSIX path of (choose file with prompt "${sanitizedPrompt}"${typeList})`,
      "on error number -128",
      "return \"\"",
      "end try",
    ]);

    return output ? [output] : [];
  }

  chooseFolderPath(prompt: string, allowCreate = false) {
    const sanitizedPrompt = escapeAppleScriptString(prompt);
    const output = allowCreate
      ? runAppleScript([
          "try",
          `return POSIX path of (choose folder name with prompt "${sanitizedPrompt}")`,
          "on error number -128",
          "return \"\"",
          "end try",
        ])
      : runAppleScript([
          "try",
          `return POSIX path of (choose folder with prompt "${sanitizedPrompt}")`,
          "on error number -128",
          "return \"\"",
          "end try",
        ]);

    return output.trim();
  }

  private normalizePluginSelectionInput(input: PluginSelectionInput): {
    pluginId: string;
    pluginName: string;
    pluginVendor: string;
    pluginFormat: PluginInfo["format"] | "";
  } {
    const pluginId = input.pluginId?.trim() ?? "";
    const pluginFromCatalog = pluginId ? this.pluginCatalog.plugins.find((plugin) => plugin.id === pluginId) : null;
    const pluginName = pluginFromCatalog?.name ?? input.pluginName?.trim() ?? "";

    if (!pluginId && !pluginName) {
      throw new Error("Plugin selection is required.");
    }

    if (!pluginName) {
      throw new Error("Plugin name is required.");
    }

    return {
      pluginId: pluginFromCatalog?.id ?? pluginId,
      pluginName,
      pluginVendor: pluginFromCatalog?.vendor ?? input.pluginVendor?.trim() ?? "",
      pluginFormat: (pluginFromCatalog?.format ?? input.pluginFormat ?? "") as PluginInfo["format"] | "",
    };
  }

  private async waitForPath(filePath: string, timeoutMs: number) {
    const startedAt = Date.now();

    while (!existsSync(filePath)) {
      if (Date.now() - startedAt >= timeoutMs) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  private getOrCreateEditorSession(plugin: ReturnType<BatchMasterService["normalizePluginSelectionInput"]>) {
    const existing = this.editorSessions.find((session) => session.pluginId === plugin.pluginId);

    if (existing) {
      return this.syncEditorSession(existing);
    }

    const id = buildId(`editor:${plugin.pluginId || plugin.pluginName}`);
    const sessionDirectory = path.join(EDITOR_SESSIONS_DIR, `${slugify(plugin.pluginName)}-${id}`);

    ensureDir(sessionDirectory);

    const createdSession: PluginEditorSession = {
      id,
      pluginId: plugin.pluginId || id,
      pluginName: plugin.pluginName,
      pluginVendor: plugin.pluginVendor,
      pluginFormat: plugin.pluginFormat,
      projectPath: path.join(sessionDirectory, "editor-session.rpp"),
      fxChainPath: path.join(sessionDirectory, `${sanitizePathSegment(plugin.pluginName)}.RfxChain`),
      launchScriptPath: path.join(sessionDirectory, "open-plugin-editor.lua"),
      touchedAt: nowIso(),
      hasProject: false,
      hasFxChain: false,
    };

    return this.upsertEditorSession(createdSession);
  }

  private upsertEditorSession(session: PluginEditorSession) {
    const nextSession = this.syncEditorSession(session);
    const matchIndex = this.editorSessions.findIndex((entry) => entry.pluginId === nextSession.pluginId);

    if (matchIndex >= 0) {
      this.editorSessions = this.editorSessions.map((entry, index) => (index === matchIndex ? nextSession : entry));
    } else {
      this.editorSessions = [nextSession, ...this.editorSessions];
    }

    this.saveEditorSessions();
    return nextSession;
  }

  private syncEditorSession(session: PluginEditorSession): PluginEditorSession {
    ensureDir(path.dirname(session.projectPath));

    return {
      ...session,
      pluginVendor: session.pluginVendor ?? "",
      pluginFormat: session.pluginFormat ?? "",
      touchedAt: session.touchedAt ?? nowIso(),
      hasProject: existsSync(session.projectPath),
      hasFxChain: existsSync(session.fxChainPath),
    };
  }

  private buildPluginInsertCandidates(plugin: ReturnType<BatchMasterService["normalizePluginSelectionInput"]>) {
    const candidates = [
      plugin.pluginFormat && plugin.pluginVendor ? `${plugin.pluginFormat}: ${plugin.pluginName} (${plugin.pluginVendor})` : "",
      plugin.pluginFormat ? `${plugin.pluginFormat}: ${plugin.pluginName}` : "",
      plugin.pluginName,
    ].map((entry) => entry.trim()).filter(Boolean);

    return Array.from(new Set(candidates));
  }

  private buildEditorLaunchScript(input: {
    plugin: ReturnType<BatchMasterService["normalizePluginSelectionInput"]>;
    projectPath: string;
    fxChainSourcePath: string;
    initializeProject: boolean;
  }) {
    const candidateList = this.buildPluginInsertCandidates(input.plugin)
      .map((candidate) => `  ${escapeLuaString(candidate)}`)
      .join(",\n");

    return `local project_path = ${escapeLuaString(input.projectPath)}
local chain_path = ${escapeLuaString(input.fxChainSourcePath)}
local plugin_name = ${escapeLuaString(input.plugin.pluginName)}
local initialize_project = ${input.initializeProject ? "true" : "false"}
local plugin_candidates = {
${candidateList}
}

local function read_text(file_path)
  if file_path == "" then
    return ""
  end

  local handle = io.open(file_path, "r")
  if not handle then
    return ""
  end

  local text = handle:read("*a") or ""
  handle:close()
  return text
end

local function trim_start(text)
  return text:gsub("^%s+", "")
end

local function replace_block(chunk, block_name, replacement)
  local output = {}
  local collecting = false
  local depth = 0
  local found = false

  for line in (chunk .. "\\n"):gmatch("(.-)\\n") do
    local trimmed = trim_start(line)

    if not collecting and trimmed:match("^<" .. block_name .. "[%s>]") then
      collecting = true
      found = true
      depth = 1

      for replacement_line in (replacement .. "\\n"):gmatch("(.-)\\n") do
        output[#output + 1] = "    " .. replacement_line
      end
    elseif collecting then
      if trimmed:sub(1, 1) == "<" then
        depth = depth + 1
      end

      if trimmed == ">" then
        depth = depth - 1
        if depth == 0 then
          collecting = false
        end
      end
    else
      output[#output + 1] = line
    end
  end

  return found, table.concat(output, "\\n")
end

reaper.PreventUIRefresh(1)

local track = reaper.GetTrack(0, 0)
if not track then
  reaper.InsertTrackAtIndex(0, false)
  track = reaper.GetTrack(0, 0)
end

if track then
  reaper.GetSetMediaTrackInfo_String(track, "P_NAME", plugin_name, true)
end

if track and reaper.TrackFX_GetCount(track) == 0 then
  local inserted_fx = -1

  for _, candidate in ipairs(plugin_candidates) do
    inserted_fx = reaper.TrackFX_AddByName(track, candidate, false, -1)
    if inserted_fx >= 0 then
      break
    end
  end

  if inserted_fx < 0 then
    reaper.PreventUIRefresh(-1)
    reaper.ShowMessageBox("BatchMaster could not insert " .. plugin_name .. ".", "BatchMaster", 0)
    return
  end
end

if track and initialize_project then
  local chain_text = read_text(chain_path)
  if chain_text ~= "" then
    local ok, chunk = reaper.GetTrackStateChunk(track, "", false)
    if ok then
      local replaced, next_chunk = replace_block(chunk, "FXCHAIN", chain_text)
      if replaced then
        reaper.SetTrackStateChunk(track, next_chunk, false)
      end
    end
  end
end

reaper.TrackList_AdjustWindows(false)
reaper.UpdateArrange()

if track and reaper.TrackFX_GetCount(track) > 0 then
  reaper.TrackFX_Show(track, 0, 3)
end

reaper.Main_SaveProjectEx(0, project_path, 0)
reaper.PreventUIRefresh(-1)
`;
  }

  private resolveSimpleBatchFxChain(
    plugin: ReturnType<BatchMasterService["normalizePluginSelectionInput"]>,
    fxChainSourcePath?: string,
  ) {
    const explicitPath = fxChainSourcePath?.trim() ?? "";

    if (explicitPath) {
      return explicitPath;
    }

    const session = this.editorSessions.find((entry) => entry.pluginId === plugin.pluginId);

    if (!session) {
      return "";
    }

    if (existsSync(session.fxChainPath)) {
      return session.fxChainPath;
    }

    if (existsSync(session.projectPath)) {
      try {
        return this.capturePluginEditorSession(plugin).fxChainPath;
      } catch (error) {
        this.log(
          `Could not auto-capture editor settings for ${plugin.pluginName}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    return "";
  }

  private extractFirstFxChainBlock(projectPath: string) {
    const lines = readFileSync(projectPath, "utf8").split(/\r?\n/);
    const capturedLines: string[] = [];
    let collecting = false;
    let depth = 0;

    for (const line of lines) {
      const trimmed = line.trimStart();

      if (!collecting && /^<FXCHAIN(?:\s|$)/.test(trimmed)) {
        collecting = true;
        depth = 1;
        capturedLines.push(line);
        continue;
      }

      if (!collecting) {
        continue;
      }

      capturedLines.push(line);

      if (trimmed.startsWith("<")) {
        depth += 1;
      }

      if (trimmed === ">") {
        depth -= 1;

        if (depth === 0) {
          return this.normalizeIndentedBlock(capturedLines);
        }
      }
    }

    return "";
  }

  private normalizeIndentedBlock(lines: string[]) {
    const meaningfulLines = lines.filter((line) => line.trim().length > 0);

    if (meaningfulLines.length === 0) {
      return "";
    }

    const sharedIndentation = meaningfulLines.reduce((minimum, line) => {
      const match = line.match(/^(\s*)/);
      const indentLength = match ? match[1].length : 0;
      return Math.min(minimum, indentLength);
    }, Number.POSITIVE_INFINITY);

    return lines.map((line) => line.slice(sharedIndentation)).join("\n").trimEnd();
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
      if (!existsSync(fxChainPath)) {
        throw new Error(`FX chain file does not exist: ${fxChainPath}`);
      }

      const fxChainContents = readFileSync(fxChainPath, "utf8").trimEnd();

      if (!fxChainContents) {
        throw new Error(`FX chain file is empty: ${fxChainPath}`);
      }

      for (const line of fxChainContents.split(/\r?\n/)) {
        lines.push(`  ${line}`);
      }
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

  private saveEditorSessions() {
    writeJsonFile(EDITOR_SESSIONS_PATH, this.editorSessions);
  }

  private savePluginCatalog(catalog: PluginCatalogState) {
    const stored: StoredPluginCatalog = {
      plugins: catalog.plugins,
      lastUpdatedAt: catalog.lastUpdatedAt,
    };

    writeJsonFile(PLUGIN_CACHE_PATH, stored);
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

  private loadPluginCatalog() {
    const fallback: StoredPluginCatalog = { plugins: [], lastUpdatedAt: null };
    const stored = readJsonFile<StoredPluginCatalog>(PLUGIN_CACHE_PATH, fallback);

    if (stored.plugins.length > 0) {
      return {
        plugins: stored.plugins,
        loadedFromCache: true,
        cachePath: PLUGIN_CACHE_PATH,
        lastUpdatedAt: stored.lastUpdatedAt,
      } satisfies PluginCatalogState;
    }

    return this.scanPluginCatalog();
  }

  private scanPluginCatalog() {
    const plugins = [
      ...parseVstPlugins(path.join(REAPER_RESOURCE_DIR, "reaper-vstplugins_arm64.ini")),
      ...parseAuPlugins(path.join(REAPER_RESOURCE_DIR, "reaper-auplugins_arm64.ini")),
      ...parseClapPlugins(path.join(REAPER_RESOURCE_DIR, "reaper-clap-macos-aarch64.ini")),
    ].sort((left, right) => left.name.localeCompare(right.name));

    const catalog: PluginCatalogState = {
      plugins,
      loadedFromCache: false,
      cachePath: PLUGIN_CACHE_PATH,
      lastUpdatedAt: nowIso(),
    };

    this.savePluginCatalog(catalog);
    return catalog;
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
