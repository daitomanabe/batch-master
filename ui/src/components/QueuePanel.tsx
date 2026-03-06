import { useEffect, useState } from "react";

import type { EngineState, RenderProfile } from "../types";

type QueuePanelProps = {
  profiles: RenderProfile[];
  engine: EngineState;
  onAddJob: (input: { profileId: string; inputPath: string; outputPath: string }) => Promise<void>;
  onAddBatchJobs: (input: { profileId: string; inputPaths: string[]; outputDirectory?: string }) => Promise<void>;
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSuggestedOutputPath(inputPath: string, profileName: string) {
  const normalizedInput = inputPath.trim();

  if (!normalizedInput || !profileName) {
    return "";
  }

  const slashIndex = normalizedInput.lastIndexOf("/");
  const directory = slashIndex >= 0 ? normalizedInput.slice(0, slashIndex) : "";
  const fileName = slashIndex >= 0 ? normalizedInput.slice(slashIndex + 1) : normalizedInput;
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : ".wav";
  const profileSlug = slugify(profileName) || "render";
  const suggestedFileName = `${stem}--${profileSlug}${extension}`;

  return directory ? `${directory}/${suggestedFileName}` : suggestedFileName;
}

export function QueuePanel({ profiles, engine, onAddJob, onAddBatchJobs, onStart, onCancel }: QueuePanelProps) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [inputPath, setInputPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [lastSuggestedOutput, setLastSuggestedOutput] = useState("");
  const [bulkInputPaths, setBulkInputPaths] = useState("");
  const [bulkOutputDirectory, setBulkOutputDirectory] = useState("");
  const canQueue = Boolean(profileId && inputPath.trim() && outputPath.trim());
  const batchInputPaths = Array.from(new Set(bulkInputPaths.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)));
  const canQueueBatch = Boolean(profileId && batchInputPaths.length > 0);
  const activeProfile = profiles.find((profile) => profile.id === profileId) ?? null;

  useEffect(() => {
    if (!profiles.some((profile) => profile.id === profileId)) {
      setProfileId(profiles[0]?.id ?? "");
    }
  }, [profileId, profiles]);

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
            placeholder="/path/to/output.wav"
          />
        </label>

        {lastSuggestedOutput ? <p className="field-hint">Suggested from the selected profile and input file.</p> : null}

        <button className="button" onClick={submit} disabled={!canQueue}>
          Queue file
        </button>
      </div>

      <div className="bulk-queue">
        <div className="section-title">
          <h3>Bulk Queue</h3>
          <p>Paste multiple absolute input paths. Leave output directory empty to write beside each source file.</p>
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
            <span>Output directory (optional)</span>
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
    </section>
  );
}
