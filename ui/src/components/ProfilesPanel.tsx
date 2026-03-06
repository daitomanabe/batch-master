import { useState } from "react";

import type { FxChainCandidate, RenderProfile } from "../types";

type ProfilesPanelProps = {
  profiles: RenderProfile[];
  fxChains: FxChainCandidate[];
  onCreate: (input: {
    name: string;
    fxChainSourcePath?: string;
    notes?: string;
    copyToManagedStore?: boolean;
  }) => Promise<void>;
  onDelete: (profileId: string) => Promise<void>;
};

export function ProfilesPanel({ profiles, fxChains, onCreate, onDelete }: ProfilesPanelProps) {
  const [name, setName] = useState("");
  const [fxChainPath, setFxChainPath] = useState("");
  const [notes, setNotes] = useState("");
  const [copyToManagedStore, setCopyToManagedStore] = useState(true);
  const canSubmit = name.trim().length > 0;

  const submit = async () => {
    await onCreate({
      name,
      fxChainSourcePath: fxChainPath || undefined,
      notes,
      copyToManagedStore,
    });

    setName("");
    setFxChainPath("");
    setNotes("");
    setCopyToManagedStore(true);
  };

  return (
    <section className="panel panel-profiles">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Profiles</p>
          <h2>Render Profiles</h2>
        </div>
      </div>

      <div className="form-grid">
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Club Master" />
        </label>

        <label>
          <span>.RfxChain path (optional)</span>
          <input
            value={fxChainPath}
            onChange={(event) => setFxChainPath(event.target.value)}
            placeholder="/path/to/chain.RfxChain"
          />
        </label>

        <label>
          <span>Notes</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Streaming chain" />
        </label>

        <label className="checkbox-row">
          <input
            checked={copyToManagedStore}
            onChange={(event) => setCopyToManagedStore(event.target.checked)}
            type="checkbox"
          />
          <span>Copy FX chain into BatchMaster managed storage</span>
        </label>

        <button className="button button-primary" onClick={submit} disabled={!canSubmit}>
          Create profile
        </button>
      </div>

      <div className="candidate-list">
        <h3>Detected FX Chains</h3>
        {fxChains.length === 0 ? (
          <div className="empty-state">No .RfxChain files found. You can still paste a path manually.</div>
        ) : (
          fxChains.map((candidate) => (
            <button className="candidate-chip" key={candidate.id} onClick={() => setFxChainPath(candidate.path)}>
              {candidate.name}
            </button>
          ))
        )}
      </div>

      <div className="profile-list">
        {profiles.map((profile) => (
          <article className="profile-card" key={profile.id}>
            <div>
              <h3>{profile.name}</h3>
              <p>{profile.notes || "No notes"}</p>
              <code>{profile.fxChainPath || "Dry render (no FX chain)"}</code>
              <p>Updated: {new Date(profile.updatedAt).toLocaleString("ja-JP")}</p>
            </div>
            <button className="button button-danger" onClick={() => void onDelete(profile.id)} disabled={profiles.length === 1}>
              Delete
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
