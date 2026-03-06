import type { BootstrapPayload, RenderProfile, StatePayload } from "../types";

type CreateProfileInput = {
  name: string;
  fxChainSourcePath?: string;
  notes?: string;
  copyToManagedStore?: boolean;
};

type AddJobInput = {
  profileId: string;
  inputPath: string;
  outputPath: string;
};

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchBootstrap() {
  return request<BootstrapPayload>("/api/bootstrap");
}

export async function refreshEnvironment() {
  return request("/api/environment/refresh", { method: "POST" });
}

export async function createProfile(input: CreateProfileInput) {
  return request<RenderProfile>("/api/profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteProfile(profileId: string) {
  return request<void>(`/api/profiles/${profileId}`, { method: "DELETE" });
}

export async function addJob(input: AddJobInput) {
  return request("/api/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function retryJob(jobId: string) {
  return request(`/api/jobs/${jobId}/retry`, {
    method: "POST",
  });
}

export async function removeJob(jobId: string) {
  return request<void>(`/api/jobs/${jobId}`, {
    method: "DELETE",
  });
}

export async function clearFinishedJobs() {
  return request<void>("/api/jobs/clear-finished", { method: "POST" });
}

export async function startBatch() {
  return request<{ started: boolean }>("/api/batch/start", { method: "POST" });
}

export async function cancelBatch() {
  return request<{ cancelled: boolean }>("/api/batch/cancel", { method: "POST" });
}

export function subscribeToEvents(handlers: {
  onState: (payload: StatePayload) => void;
  onLogs: (payload: string[]) => void;
  onLog: (payload: string) => void;
  onError?: () => void;
}) {
  const source = new EventSource("/api/events");

  source.addEventListener("state", (event) => {
    handlers.onState(JSON.parse((event as MessageEvent).data) as StatePayload);
  });

  source.addEventListener("logs", (event) => {
    handlers.onLogs(JSON.parse((event as MessageEvent).data) as string[]);
  });

  source.addEventListener("log", (event) => {
    handlers.onLog(JSON.parse((event as MessageEvent).data) as string);
  });

  source.onerror = () => {
    handlers.onError?.();
  };

  return () => {
    source.close();
  };
}
