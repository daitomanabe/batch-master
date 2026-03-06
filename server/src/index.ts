import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BatchMasterService } from "./service.js";

const app = express();
const service = new BatchMasterService();
const port = Number(process.env.BM_PORT ?? 3310);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDistDir = path.resolve(__dirname, "../../ui/dist");

app.use(cors());
app.use(express.json());

app.get("/api/bootstrap", (_request, response) => {
  response.json(service.getBootstrap());
});

app.post("/api/environment/refresh", (_request, response) => {
  response.json(service.refreshEnvironment());
});

app.post("/api/plugins/refresh", (_request, response) => {
  response.json(service.refreshPluginCatalog());
});

app.post("/api/dialog/file", (request, response) => {
  try {
    const paths = service.chooseFilePaths(
      (request.body as { prompt?: string }).prompt ?? "Choose file",
      Boolean((request.body as { multiple?: boolean }).multiple),
      ((request.body as { allowedExtensions?: string[] }).allowedExtensions ?? []).filter(Boolean),
    );
    response.json({ paths });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not open file dialog." });
  }
});

app.post("/api/dialog/folder", (request, response) => {
  try {
    const pathValue = service.chooseFolderPath(
      (request.body as { prompt?: string }).prompt ?? "Choose folder",
      Boolean((request.body as { allowCreate?: boolean }).allowCreate),
    );
    response.json({ path: pathValue });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not open folder dialog." });
  }
});

app.get("/api/events", (request, response) => {
  void request;
  service.subscribe(response);
});

app.post("/api/profiles", async (request, response) => {
  try {
    const profile = await service.createProfile(request.body as { name: string; fxChainSourcePath?: string; notes?: string; copyToManagedStore?: boolean });
    response.status(201).json(profile);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not create profile." });
  }
});

app.patch("/api/profiles/:profileId", async (request, response) => {
  try {
    const profile = await service.updateProfile(request.params.profileId, request.body as {
      name?: string;
      fxChainSourcePath?: string;
      notes?: string;
      copyToManagedStore?: boolean;
      clearFxChain?: boolean;
    });
    response.json(profile);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not update profile." });
  }
});

app.delete("/api/profiles/:profileId", (request, response) => {
  try {
    service.deleteProfile(request.params.profileId);
    response.status(204).end();
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not delete profile." });
  }
});

app.post("/api/jobs", (request, response) => {
  try {
    const job = service.addJob(request.body as { profileId: string; inputPath: string; outputPath: string });
    response.status(201).json(job);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not add job." });
  }
});

app.post("/api/jobs/batch", (request, response) => {
  try {
    const jobs = service.addJobsBatch(request.body as { profileId: string; inputPaths: string[]; outputDirectory?: string });
    response.status(201).json(jobs);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not add batch jobs." });
  }
});

app.post("/api/jobs/folder", (request, response) => {
  try {
    const jobs = service.queueFolderJobs(request.body as {
      profileId: string;
      inputDirectory: string;
      outputBaseDirectory?: string;
      recursive?: boolean;
    });
    response.status(201).json(jobs);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not queue folder jobs." });
  }
});

app.post("/api/simple-batch/run", async (request, response) => {
  try {
    const result = await service.runSimpleFolderBatch(request.body as {
      pluginName: string;
      fxChainSourcePath?: string;
      inputDirectory: string;
      recursive?: boolean;
    });
    response.json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not start simple batch." });
  }
});

app.post("/api/jobs/:jobId/retry", (request, response) => {
  try {
    const job = service.retryJob(request.params.jobId);
    response.status(201).json(job);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not retry job." });
  }
});

app.delete("/api/jobs/:jobId", (request, response) => {
  try {
    service.removeJob(request.params.jobId);
    response.status(204).end();
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not remove job." });
  }
});

app.post("/api/saved-settings", (request, response) => {
  try {
    const settings = service.createSavedSettings(request.body as {
      name: string;
      profileId: string;
      inputDirectory: string;
      outputBaseDirectory?: string;
      recursive?: boolean;
    });
    response.status(201).json(settings);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not save settings." });
  }
});

app.patch("/api/saved-settings/:settingsId", (request, response) => {
  try {
    const settings = service.updateSavedSettings(request.params.settingsId, request.body as {
      name?: string;
      profileId?: string;
      inputDirectory?: string;
      outputBaseDirectory?: string;
      recursive?: boolean;
    });
    response.json(settings);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not update settings." });
  }
});

app.delete("/api/saved-settings/:settingsId", (request, response) => {
  try {
    service.deleteSavedSettings(request.params.settingsId);
    response.status(204).end();
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not delete settings." });
  }
});

app.post("/api/jobs/clear-finished", (_request, response) => {
  service.clearFinishedJobs();
  response.status(204).end();
});

app.post("/api/batch/start", async (_request, response) => {
  try {
    const started = await service.startBatch();
    response.json({ started });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not start batch." });
  }
});

app.post("/api/batch/cancel", async (_request, response) => {
  const cancelled = await service.cancelBatch();
  response.json({ cancelled });
});

if (existsSync(uiDistDir)) {
  app.use(express.static(uiDistDir));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(uiDistDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`BatchMaster server listening on http://localhost:${port}`);
});
