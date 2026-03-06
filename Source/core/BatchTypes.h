#pragma once

#include <JuceHeader.h>

namespace batchmaster
{
struct PluginInfo
{
    juce::String id;
    juce::String name;
    juce::String vendor;
    juce::String category;
    juce::String path;
    bool hasPresets = false;
};

struct ChainItem
{
    int uid = 0;
    juce::String pluginId;
    juce::String pluginPath;
    juce::String name;
    juce::String vendor;
    juce::String category;
    juce::String preset;
    juce::String presetFilePath;
    bool enabled = true;
};

enum class BatchJobStatus
{
    queued,
    processing,
    done,
    error
};

struct BatchJob
{
    juce::String id;
    juce::String inputFile;
    juce::String outputFile;
    BatchJobStatus status = BatchJobStatus::queued;
    double progress = 0.0;
    juce::String errorMessage;
};

struct SavedChain
{
    juce::String name;
    juce::String createdAt;
    juce::Array<ChainItem> chain;
};

struct ProgressSnapshot
{
    bool running = false;
    bool cancelled = false;
    juce::String currentJobId;
    juce::String currentFile;
    double currentPercent = 0.0;
    int totalJobs = 0;
    int completedJobs = 0;
    juce::Array<BatchJob> jobs;
};

inline juce::var makeObject(std::initializer_list<std::pair<juce::Identifier, juce::var>> properties)
{
    auto* object = new juce::DynamicObject();

    for (const auto& property : properties)
        object->setProperty(property.first, property.second);

    return juce::var(object);
}

inline juce::String batchJobStatusToString(BatchJobStatus status)
{
    switch (status)
    {
        case BatchJobStatus::queued: return "queued";
        case BatchJobStatus::processing: return "processing";
        case BatchJobStatus::done: return "done";
        case BatchJobStatus::error: return "error";
    }

    return "error";
}

inline BatchJobStatus batchJobStatusFromString(const juce::String& status)
{
    if (status == "queued")
        return BatchJobStatus::queued;

    if (status == "processing")
        return BatchJobStatus::processing;

    if (status == "done")
        return BatchJobStatus::done;

    return BatchJobStatus::error;
}

inline juce::String buildPluginId(const juce::String& path)
{
    return juce::String::toHexString(static_cast<juce::int64>(path.hashCode64()));
}

inline juce::String makeIsoTimestamp()
{
    return juce::Time::getCurrentTime().formatted("%Y-%m-%dT%H:%M:%S%z");
}

inline juce::var pluginInfoToVar(const PluginInfo& plugin)
{
    return makeObject({
        { "id", plugin.id },
        { "name", plugin.name },
        { "vendor", plugin.vendor },
        { "category", plugin.category },
        { "path", plugin.path },
        { "hasPresets", plugin.hasPresets }
    });
}

inline juce::var chainItemToVar(const ChainItem& item)
{
    return makeObject({
        { "uid", item.uid },
        { "pluginId", item.pluginId },
        { "pluginPath", item.pluginPath },
        { "name", item.name },
        { "vendor", item.vendor },
        { "category", item.category },
        { "preset", item.preset },
        { "presetFilePath", item.presetFilePath.isNotEmpty() ? juce::var(item.presetFilePath) : juce::var() },
        { "enabled", item.enabled }
    });
}

inline juce::var batchJobToVar(const BatchJob& job)
{
    return makeObject({
        { "id", job.id },
        { "inputFile", job.inputFile },
        { "outputFile", job.outputFile },
        { "status", batchJobStatusToString(job.status) },
        { "progress", job.progress },
        { "errorMessage", job.errorMessage }
    });
}

inline juce::var savedChainToVar(const SavedChain& chain)
{
    juce::Array<juce::var> chainItems;

    for (const auto& item : chain.chain)
        chainItems.add(chainItemToVar(item));

    return makeObject({
        { "name", chain.name },
        { "createdAt", chain.createdAt },
        { "chain", juce::var(chainItems) }
    });
}

inline juce::var progressSnapshotToVar(const ProgressSnapshot& snapshot)
{
    juce::Array<juce::var> jobs;

    for (const auto& job : snapshot.jobs)
        jobs.add(batchJobToVar(job));

    return makeObject({
        { "running", snapshot.running },
        { "cancelled", snapshot.cancelled },
        { "currentJobId", snapshot.currentJobId },
        { "currentFile", snapshot.currentFile },
        { "currentPercent", snapshot.currentPercent },
        { "totalJobs", snapshot.totalJobs },
        { "completedJobs", snapshot.completedJobs },
        { "jobs", juce::var(jobs) }
    });
}

inline juce::StringArray stringArrayFromVar(const juce::var& value)
{
    juce::StringArray strings;

    if (const auto* array = value.getArray())
        for (const auto& entry : *array)
            strings.add(entry.toString());

    return strings;
}

inline juce::Result chainItemFromVar(const juce::var& value, ChainItem& item, int fallbackUid)
{
    const auto* object = value.getDynamicObject();

    if (object == nullptr)
        return juce::Result::fail("Chain item is not an object.");

    item.uid = object->hasProperty("uid") ? static_cast<int>(object->getProperty("uid")) : fallbackUid;
    item.pluginId = object->getProperty("pluginId").toString();
    item.pluginPath = object->getProperty("pluginPath").toString();
    item.name = object->getProperty("name").toString();
    item.vendor = object->getProperty("vendor").toString();
    item.category = object->getProperty("category").toString();
    item.preset = object->getProperty("preset").toString();
    item.presetFilePath = object->getProperty("presetFilePath").toString();
    item.enabled = ! object->hasProperty("enabled") || static_cast<bool>(object->getProperty("enabled"));

    if (item.pluginId.isEmpty())
        return juce::Result::fail("Chain item is missing pluginId.");

    return juce::Result::ok();
}

inline juce::Result parseChainItemsFromVar(const juce::var& value, juce::Array<ChainItem>& items)
{
    juce::var chainValue = value;

    if (const auto* object = value.getDynamicObject())
        chainValue = object->getProperty("chain");

    const auto* array = chainValue.getArray();

    if (array == nullptr)
        return juce::Result::fail("Chain JSON must contain an array of items.");

    items.clearQuick();

    for (int index = 0; index < array->size(); ++index)
    {
        ChainItem item;
        const auto result = chainItemFromVar(array->getReference(index), item, index + 1);

        if (result.failed())
            return result;

        items.add(item);
    }

    return juce::Result::ok();
}

inline juce::Result parseChainItemsFromJson(const juce::String& chainJson, juce::Array<ChainItem>& items)
{
    juce::var parsed;
    const auto parseResult = juce::JSON::parse(chainJson, parsed);

    if (parseResult.failed())
        return parseResult;

    return parseChainItemsFromVar(parsed, items);
}

inline juce::String chainItemsToJson(const juce::Array<ChainItem>& items, bool pretty = true)
{
    juce::Array<juce::var> values;

    for (const auto& item : items)
        values.add(chainItemToVar(item));

    return juce::JSON::toString(juce::var(values), pretty);
}

inline int countCompletedJobs(const juce::Array<BatchJob>& jobs)
{
    int completed = 0;

    for (const auto& job : jobs)
        if (job.status == BatchJobStatus::done)
            ++completed;

    return completed;
}
} // namespace batchmaster
