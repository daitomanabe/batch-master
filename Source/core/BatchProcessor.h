#pragma once

#include <JuceHeader.h>

#include "BatchTypes.h"
#include "OfflineRenderer.h"

namespace batchmaster
{
class PluginScanner;
class PresetManager;

class BatchProcessor : private juce::Thread
{
public:
    BatchProcessor(PluginScanner& scanner, PresetManager& presetManager);
    ~BatchProcessor() override;

    juce::String addJob(const juce::String& inputPath, const juce::String& outputPath);
    bool startBatch(const juce::String& chainJson);
    bool cancelBatch();
    ProgressSnapshot getProgress() const;

    void setProgressCallback(std::function<void(const BatchJob&, bool)> callback);
    void setBatchDoneCallback(std::function<void(int, double)> callback);

private:
    void run() override;
    int findNextQueuedJobIndexLocked() const;
    void updateJob(int index, const std::function<void(BatchJob&)>& mutator, bool emitDoneEvent);
    void updateSnapshotMetadata();

    PluginScanner& scanner;
    PresetManager& presetManager;
    OfflineRenderer renderer;
    mutable juce::CriticalSection lock;
    juce::Array<BatchJob> jobs;
    ProgressSnapshot snapshot;
    juce::String chainJson;
    std::atomic_bool cancelRequested { false };
    std::function<void(const BatchJob&, bool)> progressCallback;
    std::function<void(int, double)> batchDoneCallback;
    double startedAtMs = 0.0;
};
} // namespace batchmaster
