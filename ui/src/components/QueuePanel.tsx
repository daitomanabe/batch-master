import { useEffect, useState } from "react";

import type { EngineState, RenderProfile } from "../types";

type QueuePanelProps = {
  profiles: RenderProfile[];
  engine: EngineState;
  onAddJob: (input: { profileId: string; inputPath: string; outputPath: string }) => Promise<void>;
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
};

export function QueuePanel({ profiles, engine, onAddJob, onStart, onCancel }: QueuePanelProps) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [inputPath, setInputPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const canQueue = Boolean(profileId && inputPath.trim() && outputPath.trim());

  useEffect(() => {
    if (!profiles.some((profile) => profile.id === profileId)) {
      setProfileId(profiles[0]?.id ?? "");
    }
  }, [profileId, profiles]);

  const submit = async () => {
    await onAddJob({ profileId, inputPath, outputPath });
    setInputPath("");
    setOutputPath("");
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

        <button className="button" onClick={submit} disabled={!canQueue}>
          Queue file
        </button>
      </div>
    </section>
  );
}
