# BatchMaster Design

## Backend

- A Node/Express server owns profiles, jobs, engine state, and an event stream.
- `ReaperIntegration` detects REAPER paths, generates one-job batch-convert control files, and spawns REAPER.
- `BatchEngine` processes queued jobs sequentially, tails each REAPER splash log, and persists job updates after every state transition.
- Imported `.RfxChain` files are copied into the app data directory so profiles remain stable even if the original file moves.
- Batch queue requests can generate multiple jobs at once from a list of source files plus an optional output directory.
- Folder queue requests expand a WAV directory into many jobs and map outputs to `<output-base>/<profile-name>/<relative-input-path>`.
- Saved folder-batch settings are stored alongside profiles and jobs in the app data directory.

## Frontend

- React renders a single control surface for environment status, render profiles, queue entry, live jobs, and logs.
- The queue surface supports single-file entry and multi-file batch entry.
- The queue surface also supports folder scans and saved folder-batch settings.
- Saved profiles are editable in place so `.RfxChain` paths and notes can be updated without recreating the profile.
- Initial state is fetched from `/api/bootstrap`.
- Live updates arrive through Server-Sent Events and are also backed by explicit refresh endpoints.

## Tradeoffs

- The system intentionally avoids direct VST hosting. REAPER becomes the sole plugin host and renderer.
- Batch execution is one REAPER process per job. This keeps failure isolation high and state management simple at the cost of startup time.
- The first REAPER run may still be slow if REAPER decides to rescan plugins; that cost is logged explicitly instead of being hidden.
