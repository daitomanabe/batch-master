# BatchMaster Design

## Backend

- A Node/Express server owns profiles, jobs, engine state, and an event stream.
- `ReaperIntegration` detects REAPER paths, generates one-job batch-convert control files, and spawns REAPER.
- `BatchEngine` processes queued jobs sequentially, tails each REAPER splash log, and persists job updates after every state transition.
- Imported `.RfxChain` files are copied into the app data directory so profiles remain stable even if the original file moves.

## Frontend

- React renders a single control surface for environment status, render profiles, queue entry, live jobs, and logs.
- Initial state is fetched from `/api/bootstrap`.
- Live updates arrive through Server-Sent Events and are also backed by explicit refresh endpoints.

## Tradeoffs

- The system intentionally avoids direct VST hosting. REAPER becomes the sole plugin host and renderer.
- Batch execution is one REAPER process per job. This keeps failure isolation high and state management simple at the cost of startup time.
- The first REAPER run may still be slow if REAPER decides to rescan plugins; that cost is logged explicitly instead of being hidden.
