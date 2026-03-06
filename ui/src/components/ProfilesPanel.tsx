import { useEffect, useState } from "react";

import type { FxChainCandidate, RenderProfile } from "../types";

type ProfileDraft = {
  name: string;
  fxChainPath: string;
  notes: string;
  copyToManagedStore: boolean;
};

type ProfilesPanelProps = {
  profiles: RenderProfile[];
  fxChains: FxChainCandidate[];
  onCreate: (input: {
    name: string;
    fxChainSourcePath?: string;
    notes?: string;
    copyToManagedStore?: boolean;
  }) => Promise<void>;
  onUpdate: (
    profileId: string,
    input: {
      name?: string;
      fxChainSourcePath?: string;
      notes?: string;
      copyToManagedStore?: boolean;
      clearFxChain?: boolean;
    },
  ) => Promise<void>;
  onDelete: (profileId: string) => Promise<void>;
};

function buildDraft(profile: RenderProfile): ProfileDraft {
  return {
    name: profile.name,
    fxChainPath: profile.fxChainPath ?? "",
    notes: profile.notes,
    copyToManagedStore: profile.importedFxChainPath !== null,
  };
}

export function ProfilesPanel({ profiles, fxChains, onCreate, onUpdate, onDelete }: ProfilesPanelProps) {
  const [name, setName] = useState("");
  const [fxChainPath, setFxChainPath] = useState("");
  const [notes, setNotes] = useState("");
  const [copyToManagedStore, setCopyToManagedStore] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({});
  const canSubmit = name.trim().length > 0;
  const profileSignature = profiles.map((profile) => `${profile.id}:${profile.updatedAt}`).join("|");

  useEffect(() => {
    setDrafts((current) => {
      const next: Record<string, ProfileDraft> = {};

      for (const profile of profiles) {
        const existing = current[profile.id];
        next[profile.id] =
          existing && existing.name === profile.name && existing.notes === profile.notes && existing.fxChainPath === (profile.fxChainPath ?? "")
            ? existing
            : buildDraft(profile);
      }

      return next;
    });
  }, [profileSignature, profiles]);

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

  const updateDraft = (profileId: string, patch: Partial<ProfileDraft>) => {
    setDrafts((current) => {
      const profile = profiles.find((entry) => entry.id === profileId);

      if (!profile) {
        return current;
      }

      return {
        ...current,
        [profileId]: {
          ...(current[profileId] ?? buildDraft(profile)),
          ...patch,
        },
      };
    });
  };

  const saveProfile = async (profile: RenderProfile) => {
    const draft = drafts[profile.id] ?? buildDraft(profile);

    await onUpdate(profile.id, {
      name: draft.name,
      fxChainSourcePath: draft.fxChainPath,
      notes: draft.notes,
      copyToManagedStore: draft.copyToManagedStore,
      clearFxChain: draft.fxChainPath.trim().length === 0,
    });
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
          <article className="profile-card profile-card-edit" key={profile.id}>
            <div className="profile-form">
              <label>
                <span>Name</span>
                <input
                  value={(drafts[profile.id] ?? buildDraft(profile)).name}
                  onChange={(event) => updateDraft(profile.id, { name: event.target.value })}
                />
              </label>

              <label>
                <span>Notes</span>
                <input
                  value={(drafts[profile.id] ?? buildDraft(profile)).notes}
                  onChange={(event) => updateDraft(profile.id, { notes: event.target.value })}
                />
              </label>

              <label>
                <span>.RfxChain path</span>
                <input
                  value={(drafts[profile.id] ?? buildDraft(profile)).fxChainPath}
                  onChange={(event) => updateDraft(profile.id, { fxChainPath: event.target.value })}
                  placeholder="Leave empty for dry render"
                />
              </label>

              <label className="checkbox-row">
                <input
                  checked={(drafts[profile.id] ?? buildDraft(profile)).copyToManagedStore}
                  onChange={(event) => updateDraft(profile.id, { copyToManagedStore: event.target.checked })}
                  type="checkbox"
                />
                <span>Copy FX chain into BatchMaster managed storage</span>
              </label>

              <code>{profile.fxChainPath || "Dry render (no FX chain)"}</code>
              <p>Updated: {new Date(profile.updatedAt).toLocaleString("ja-JP")}</p>
            </div>
            <div className="profile-actions">
              <button
                className="button button-primary"
                onClick={() => void saveProfile(profile)}
                disabled={!((drafts[profile.id] ?? buildDraft(profile)).name.trim())}
              >
                Save
              </button>
              <button className="button button-danger" onClick={() => void onDelete(profile.id)} disabled={profiles.length === 1}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
