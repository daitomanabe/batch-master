import { useEffect, useState } from "react";

import type { EngineState, RenderProfile, SavedBatchSettings } from "../types";

type QueuePanelProps = {
  profiles: RenderProfile[];
  savedSettings: SavedBatchSettings[];
  engine: EngineState;
  onAddJob: (input: { profileId: string; inputPath: string; outputPath: string }) => Promise<void>;
  onAddBatchJobs: (input: { profileId: string; inputPaths: string[]; outputDirectory?: string }) => Promise<void>;
  onQueueFolder: (input: {
    profileId: string;
    inputDirectory: string;
    outputBaseDirectory?: string;
    recursive?: boolean;
  }) => Promise<void>;
  onCreateSavedSettings: (input: {
    name: string;
    profileId: string;
    inputDirectory: string;
    outputBaseDirectory?: string;
    recursive?: boolean;
  }) => Promise<void>;
  onUpdateSavedSettings: (
    settingsId: string,
    input: {
      name?: string;
      profileId?: string;
      inputDirectory?: string;
      outputBaseDirectory?: string;
      recursive?: boolean;
    },
  ) => Promise<void>;
  onDeleteSavedSettings: (settingsId: string) => Promise<void>;
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
};

function sanitizePathSegment(value: string) {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().replace(/\s+/g, " ");
  return sanitized || "Render";
}

function buildSuggestedOutputPath(inputPath: string, profileName: string) {
  const normalizedInput = inputPath.trim();

  if (!normalizedInput || !profileName) {
    return "";
  }

  const slashIndex = normalizedInput.lastIndexOf("/");
  const directory = slashIndex >= 0 ? normalizedInput.slice(0, slashIndex) : "";
  const fileName = slashIndex >= 0 ? normalizedInput.slice(slashIndex + 1) : normalizedInput;
  const profileDirectory = sanitizePathSegment(profileName);

  return directory ? `${directory}/${profileDirectory}/${fileName}` : `${profileDirectory}/${fileName}`;
}

function buildFolderPreview(inputDirectory: string, profileName: string, outputBaseDirectory: string) {
  const baseDirectory = outputBaseDirectory.trim() || inputDirectory.trim();

  if (!baseDirectory || !profileName) {
    return "";
  }

  return `${baseDirectory}/${sanitizePathSegment(profileName)}/same-file.wav`;
}

export function QueuePanel({
  profiles,
  savedSettings,
  engine,
  onAddJob,
  onAddBatchJobs,
  onQueueFolder,
  onCreateSavedSettings,
  onUpdateSavedSettings,
  onDeleteSavedSettings,
  onStart,
  onCancel,
}: QueuePanelProps) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [inputPath, setInputPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [lastSuggestedOutput, setLastSuggestedOutput] = useState("");
  const [bulkInputPaths, setBulkInputPaths] = useState("");
  const [bulkOutputDirectory, setBulkOutputDirectory] = useState("");
  const [folderInputDirectory, setFolderInputDirectory] = useState("");
  const [folderOutputBaseDirectory, setFolderOutputBaseDirectory] = useState("");
  const [recursive, setRecursive] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [selectedSettingsId, setSelectedSettingsId] = useState("");
  const canQueue = Boolean(profileId && inputPath.trim() && outputPath.trim());
  const batchInputPaths = Array.from(new Set(bulkInputPaths.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)));
  const canQueueBatch = Boolean(profileId && batchInputPaths.length > 0);
  const canQueueFolder = Boolean(profileId && folderInputDirectory.trim());
  const canSaveSettings = Boolean(profileId && folderInputDirectory.trim() && settingsName.trim());
  const activeProfile = profiles.find((profile) => profile.id === profileId) ?? null;
  const selectedSettings = savedSettings.find((settings) => settings.id === selectedSettingsId) ?? null;
  const folderPreview = buildFolderPreview(folderInputDirectory, activeProfile?.name ?? "", folderOutputBaseDirectory);

  useEffect(() => {
    if (!profiles.some((profile) => profile.id === profileId)) {
      setProfileId(profiles[0]?.id ?? "");
    }
  }, [profileId, profiles]);

  useEffect(() => {
    if (selectedSettingsId && !savedSettings.some((settings) => settings.id === selectedSettingsId)) {
      setSelectedSettingsId("");
      setSettingsName("");
    }
  }, [savedSettings, selectedSettingsId]);

  useEffect(() => {
    const suggestion = buildSuggestedOutputPath(inputPath, activeProfile?.name ?? "");

    if (!suggestion) {
      setLastSuggestedOutput("");
      return;
    }

    if (!outputPath.trim() || outputPath === lastSuggestedOutput) {
      setOutputPath(suggestion);
    }

    setLastSuggestedOutput(suggestion);
  }, [activeProfile?.name, inputPath, lastSuggestedOutput, outputPath]);

  const applySavedSettings = (settingsId: string) => {
    setSelectedSettingsId(settingsId);

    const settings = savedSettings.find((entry) => entry.id === settingsId);

    if (!settings) {
      setSettingsName("");
      return;
    }

    setSettingsName(settings.name);
    setProfileId(settings.profileId);
    setFolderInputDirectory(settings.inputDirectory);
    setFolderOutputBaseDirectory(settings.outputBaseDirectory);
    setRecursive(settings.recursive);
  };

  const submit = async () => {
    await onAddJob({ profileId, inputPath, outputPath });
    setInputPath("");
    setOutputPath("");
    setLastSuggestedOutput("");
  };

  const submitBatch = async () => {
    await onAddBatchJobs({
      profileId,
      inputPaths: batchInputPaths,
      outputDirectory: bulkOutputDirectory.trim() || undefined,
    });
    setBulkInputPaths("");
    setBulkOutputDirectory("");
  };

  const submitFolder = async () => {
    await onQueueFolder({
      profileId,
      inputDirectory: folderInputDirectory,
      outputBaseDirectory: folderOutputBaseDirectory.trim() || undefined,
      recursive,
    });
  };

  const saveSettings = async () => {
    await onCreateSavedSettings({
      name: settingsName,
      profileId,
      inputDirectory: folderInputDirectory,
      outputBaseDirectory: folderOutputBaseDirectory.trim() || undefined,
      recursive,
    });
  };

  const updateSettings = async () => {
    if (!selectedSettings) {
      return;
    }

    await onUpdateSavedSettings(selectedSettings.id, {
      name: settingsName,
      profileId,
      inputDirectory: folderInputDirectory,
      outputBaseDirectory: folderOutputBaseDirectory.trim() || undefined,
      recursive,
    });
  };

  const deleteSettings = async () => {
    if (!selectedSettings) {
      return;
    }

    await onDeleteSavedSettings(selectedSettings.id);
    setSelectedSettingsId("");
    setSettingsName("");
  };

  return (
    <section className="panel panel-queue">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Queue</p>
          <h2>Batch Jobs</h2>
        </div>
        <div className="actions-row">
          <button className="button button-primary" onClick={() => void onStart()} disabled={engine.running}>
            Start batch
          </button>
          <button className="button button-danger" onClick={() => void onCancel()} disabled={!engine.running}>
            Cancel
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label>
          <span>Profile</span>
          <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Input file</span>
          <input value={inputPath} onChange={(event) => setInputPath(event.target.value)} placeholder="/path/to/input.wav" />
        </label>

        <label>
          <span>Output file</span>
          <input
            value={outputPath}
            onChange={(event) => setOutputPath(event.target.value)}
            placeholder="/path/to/Ozone 12/input.wav"
          />
        </label>

        {lastSuggestedOutput ? <p className="field-hint">Suggested output keeps the same file name under a profile-named folder.</p> : null}

        <button className="button" onClick={submit} disabled={!canQueue}>
          Queue file
        </button>
      </div>

      <div className="bulk-queue">
        <div className="section-title">
          <h3>Bulk Queue</h3>
          <p>Paste absolute file paths. Output files keep the same names and are grouped into a profile-named folder.</p>
        </div>

        <div className="form-grid">
          <label>
            <span>Input files</span>
            <textarea
              value={bulkInputPaths}
              onChange={(event) => setBulkInputPaths(event.target.value)}
              placeholder={"/path/to/track-01.wav\n/path/to/track-02.wav"}
              rows={6}
            />
          </label>

          <label>
            <span>Output base folder (optional)</span>
            <input
              value={bulkOutputDirectory}
              onChange={(event) => setBulkOutputDirectory(event.target.value)}
              placeholder="/path/to/render-output"
            />
          </label>

          <p className="field-hint">{batchInputPaths.length} file(s) ready to queue.</p>

          <button className="button" onClick={submitBatch} disabled={!canQueueBatch}>
            Queue listed files
          </button>
        </div>
      </div>

      <div className="bulk-queue">
        <div className="section-title">
          <h3>Folder Queue</h3>
          <p>Scan a folder for WAV files and render them into a subfolder named after the selected profile.</p>
        </div>

        <div className="settings-strip">
          <label>
            <span>Saved settings</span>
            <select value={selectedSettingsId} onChange={(event) => applySavedSettings(event.target.value)}>
              <option value="">Select saved settings</option>
              {savedSettings.map((settings) => {
                const settingsProfile = profiles.find((profile) => profile.id === settings.profileId);
                return (
                  <option key={settings.id} value={settings.id}>
                    {settings.name} ({settingsProfile?.name ?? "Missing profile"})
                  </option>
                );
              })}
            </select>
          </label>

          <label>
            <span>Settings name</span>
            <input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} placeholder="Ozone 12 Folder Batch" />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Input folder</span>
            <input
              value={folderInputDirectory}
              onChange={(event) => setFolderInputDirectory(event.target.value)}
              placeholder="/path/to/wav-folder"
            />
          </label>

          <label>
            <span>Output base folder (optional)</span>
            <input
              value={folderOutputBaseDirectory}
              onChange={(event) => setFolderOutputBaseDirectory(event.target.value)}
              placeholder="/path/to/render-root"
            />
          </label>

          <label className="checkbox-row">
            <input checked={recursive} onChange={(event) => setRecursive(event.target.checked)} type="checkbox" />
            <span>Scan subfolders recursively</span>
          </label>

          {folderPreview ? <p className="field-hint">Preview: {folderPreview}</p> : null}

          <div className="settings-actions">
            <button className="button button-primary" onClick={submitFolder} disabled={!canQueueFolder}>
              Queue folder
            </button>
            <button className="button" onClick={saveSettings} disabled={!canSaveSettings}>
              Save new
            </button>
            <button className="button" onClick={updateSettings} disabled={!selectedSettings || !canSaveSettings}>
              Update selected
            </button>
            <button className="button button-danger" onClick={deleteSettings} disabled={!selectedSettings}>
              Delete selected
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
