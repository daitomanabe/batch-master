# BatchMaster for REAPER

BatchMaster is a local batch renderer that uses the installed REAPER application as the offline processing engine.

## What It Does

- Stores reusable render profiles that point at `.RfxChain` files.
- Lets you edit saved profiles in place, including notes and `.RfxChain` paths.
- Queues single jobs and multi-file batches.
- Suggests output filenames from the selected profile and source file.
- Launches REAPER in `-batchconvert` mode one job at a time.
- Lets you retry or remove completed jobs from the queue history.
- Streams REAPER splash logs and BatchMaster engine logs into a debug console.
- Persists jobs, profiles, and logs in `~/Library/Application Support/BatchMaster`.

## Requirements

- macOS with REAPER installed at `/Applications/REAPER.app`
- Node.js 20+

## Development

```bash
npm run install:all
npm run dev:server
npm run dev:ui
```

The API runs on `http://localhost:3310` and the Vite UI runs on `http://localhost:3000`.

## Production Build

```bash
npm run build
npm run start
```

The production server serves the built frontend and exposes the same API on port `3310`.

## Environment Overrides

- `BM_PORT`: override the HTTP port for the API and static frontend server. Default: `3310`
- `BM_REAPER_PATH`: override the REAPER binary path if REAPER is not installed in `/Applications/REAPER.app`

## Persistent Data

BatchMaster stores runtime state in `~/Library/Application Support/BatchMaster`:

- `profiles.json`
- `jobs.json`
- `logs/engine.log`
- `runs/<job-id>/reaper-splash.log`
- `runs/<job-id>/reaper-stderr.log`
