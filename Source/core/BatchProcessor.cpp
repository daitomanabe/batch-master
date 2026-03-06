#include "BatchProcessor.h"

#include "PluginChain.h"
#include "PluginScanner.h"
#include "PresetManager.h"

namespace batchmaster
{
BatchProcessor::BatchProcessor(PluginScanner& scannerToUse, PresetManager& presetManagerToUse)
    : juce::Thread("BatchProcessor"),
      scanner(scannerToUse),
      presetManager(presetManagerToUse)
{
}

BatchProcessor::~BatchProcessor()
{
    cancelRequested.store(true);
    stopThread(4000);
}

juce::String BatchProcessor::addJob(const juce::String& inputPath, const juce::String& outputPath)
{
    const juce::File inputFile(inputPath);

    if (! inputFile.existsAsFile())
        return {};

    BatchJob job;
    job.id = juce::Uuid().toString();
    job.inputFile = inputPath;
    job.outputFile = outputPath;

    {
        const juce::ScopedLock scopedLock(lock);
        jobs.add(job);
        snapshot.jobs = jobs;
        updateSnapshotMetadata();
    }

    return job.id;
}

bool BatchProcessor::startBatch(const juce::String& nextChainJson)
{
    const juce::ScopedLock scopedLock(lock);

    if (isThreadRunning() || nextChainJson.isEmpty() || findNextQueuedJobIndexLocked() < 0)
        return false;

    chainJson = nextChainJson;
    cancelRequested.store(false);
    snapshot.running = true;
    snapshot.cancelled = false;
    snapshot.currentJobId.clear();
    snapshot.currentFile.clear();
    snapshot.currentPercent = 0.0;
    updateSnapshotMetadata();
    startedAtMs = juce::Time::getMillisecondCounterHiRes();

    startThread();
    return true;
}

bool BatchProcessor::cancelBatch()
{
    cancelRequested.store(true);

    const juce::ScopedLock scopedLock(lock);
    snapshot.cancelled = true;
    return true;
}

ProgressSnapshot BatchProcessor::getProgress() const
{
    const juce::ScopedLock scopedLock(lock);
    return snapshot;
}

void BatchProcessor::setProgressCallback(std::function<void(const BatchJob&, bool)> callback)
{
    progressCallback = std::move(callback);
}

void BatchProcessor::setBatchDoneCallback(std::function<void(int, double)> callback)
{
    batchDoneCallback = std::move(callback);
}

void BatchProcessor::run()
{
    while (! threadShouldExit())
    {
        int nextIndex = -1;

        {
            const juce::ScopedLock scopedLock(lock);
            nextIndex = findNextQueuedJobIndexLocked();
        }

        if (nextIndex < 0)
            break;

        updateJob(nextIndex, [this] (BatchJob& job)
        {
            job.status = BatchJobStatus::processing;
            job.progress = 0.0;
            job.errorMessage.clear();
            snapshot.currentJobId = job.id;
            snapshot.currentFile = job.inputFile;
            snapshot.currentPercent = 0.0;
        }, false);

        PluginChain chain(scanner, presetManager);
        const auto loadResult = chain.loadFromJson(chainJson);

        if (loadResult.failed())
        {
            updateJob(nextIndex, [loadResult] (BatchJob& job)
            {
                job.status = BatchJobStatus::error;
                job.errorMessage = loadResult.getErrorMessage();
            }, true);
            break;
        }

        juce::String inputPath;
        juce::String outputPath;

        {
            const juce::ScopedLock scopedLock(lock);
            inputPath = jobs.getReference(nextIndex).inputFile;
            outputPath = jobs.getReference(nextIndex).outputFile;
        }

        const juce::File inputFile(inputPath);
        const juce::File outputFile(outputPath);

        const auto renderResult = renderer.render(inputFile,
                                                  outputFile,
                                                  chain,
                                                  [this, nextIndex] (double progress)
                                                  {
                                                      updateJob(nextIndex, [progress, this] (BatchJob& job)
                                                      {
                                                          job.progress = progress;
                                                          snapshot.currentPercent = progress;
                                                      }, false);
                                                  },
                                                  cancelRequested);

        if (renderResult.wasOk())
        {
            updateJob(nextIndex, [] (BatchJob& job)
            {
                job.status = BatchJobStatus::done;
                job.progress = 1.0;
            }, true);
        }
        else
        {
            updateJob(nextIndex, [renderResult, this] (BatchJob& job)
            {
                job.status = BatchJobStatus::error;
                job.errorMessage = renderResult.getErrorMessage();
                snapshot.cancelled = snapshot.cancelled || renderResult.getErrorMessage() == "Cancelled";
            }, true);

            if (cancelRequested.load())
                break;
        }
    }

    const auto elapsedSeconds = (juce::Time::getMillisecondCounterHiRes() - startedAtMs) / 1000.0;
    int completedJobs = 0;

    {
        const juce::ScopedLock scopedLock(lock);
        snapshot.running = false;
        snapshot.currentJobId.clear();
        snapshot.currentFile.clear();
        snapshot.currentPercent = 0.0;
        updateSnapshotMetadata();
        completedJobs = snapshot.completedJobs;
    }

    if (batchDoneCallback)
        batchDoneCallback(completedJobs, elapsedSeconds);
}

int BatchProcessor::findNextQueuedJobIndexLocked() const
{
    for (int index = 0; index < jobs.size(); ++index)
        if (jobs.getReference(index).status == BatchJobStatus::queued)
            return index;

    return -1;
}

void BatchProcessor::updateJob(int index, const std::function<void(BatchJob&)>& mutator, bool emitDoneEvent)
{
    BatchJob jobCopy;

    {
        const juce::ScopedLock scopedLock(lock);
        mutator(jobs.getReference(index));
        snapshot.jobs = jobs;
        updateSnapshotMetadata();
        jobCopy = jobs.getReference(index);
    }

    if (progressCallback)
        progressCallback(jobCopy, emitDoneEvent);
}

void BatchProcessor::updateSnapshotMetadata()
{
    snapshot.totalJobs = jobs.size();
    snapshot.completedJobs = countCompletedJobs(jobs);
}
} // namespace batchmaster
