import { useEffect, useState } from "react";

import type { BackendBridge, BatchDoneEvent, ProgressSnapshot } from "../types";

const initialProgress: ProgressSnapshot = {
  running: false,
  cancelled: false,
  currentJobId: "",
  currentFile: "",
  currentPercent: 0,
  totalJobs: 0,
  completedJobs: 0,
  jobs: [],
};

export function useBatchProgress(backend: BackendBridge) {
  const [snapshot, setSnapshot] = useState<ProgressSnapshot>(initialProgress);
  const [lastBatchDone, setLastBatchDone] = useState<BatchDoneEvent | null>(null);

  useEffect(() => {
    let disposed = false;

    const sync = async () => {
      const nextSnapshot = await backend.getProgress();

      if (!disposed) {
        setSnapshot(nextSnapshot);
      }
    };

    const progressToken = backend.addEventListener("progress.update", async () => {
      await sync();
    });

    const batchDoneToken = backend.addEventListener("batch.done", async (payload) => {
      if (!disposed) {
        setLastBatchDone(payload as BatchDoneEvent);
      }

      await sync();
    });

    void sync();
    const intervalId = window.setInterval(() => {
      void sync();
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      backend.removeEventListener(progressToken);
      backend.removeEventListener(batchDoneToken);
    };
  }, [backend]);

  return { snapshot, lastBatchDone };
}
