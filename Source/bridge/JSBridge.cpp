#include "JSBridge.h"

namespace batchmaster
{
JSBridge::JSBridge()
    : previewChain(scanner, presetManager),
      batchProcessor(scanner, presetManager)
{
    batchProcessor.setProgressCallback([this] (const BatchJob& job, bool done)
    {
        emitProgressEvent(job, done);
    });

    batchProcessor.setBatchDoneCallback([this] (int totalFiles, double elapsedSeconds)
    {
        emitBatchDoneEvent(totalFiles, elapsedSeconds);
    });
}

juce::WebBrowserComponent::Options JSBridge::extendOptions(juce::WebBrowserComponent::Options options)
{
    options = options.withNativeIntegrationEnabled();

    options = options.withNativeFunction("scanPlugins", [this] (const NativeArguments& arguments, NativeCompletion completion)
    {
        completion(pluginArrayToVar(scanner.scanPlugins(getStringArgument(arguments, 0))));
    });

    options = options.withNativeFunction("getPluginList", [this] (const NativeArguments&, NativeCompletion completion)
    {
        completion(pluginArrayToVar(scanner.getCachedPlugins()));
    });

    options = options.withNativeFunction("loadPresets", [this] (const NativeArguments& arguments, NativeCompletion completion)
    {
        const auto pluginId = getStringArgument(arguments, 0);
        const auto plugin = scanner.findPlugin(pluginId);
        completion(plugin.has_value() ? stringArrayToVar(presetManager.loadPresets(scanner, *plugin)) : stringArrayToVar({}));
    });

    options = options.withNativeFunction("loadPresetFile", [this] (const NativeArguments& arguments, NativeCompletion completion)
    {
        completion(presetManager.loadPresetFile(getStringArgument(arguments, 0), getStringArgument(arguments, 1)));
    });

    options = options.withNativeFunction("loadChain", [this] (const NativeArguments& arguments, NativeCompletion completion)
    {
        const auto candidate = getStringArgument(arguments, 0);
        const auto result = previewChain.loadFromJson(candidate);

        if (result.wasOk())
            currentChainJson = candidate;

        completion(result.wasOk());
    });

    options = options.withNativeFunction("saveChain", [this] (const NativeArguments& arguments, NativeCompletion completion)
    {
        const auto result = serializer.saveChain(getStringArgument(arguments, 0), getStringArgument(arguments, 1));
        completion(result.wasOk());
    });

    options = options.withNativeFunction("getSavedChains", [this] (const NativeArguments&, NativeCompletion completion)
    {
        completion(savedChainsToVar(serializer.getSavedChains()));
    });

    options = options.withNativeFunction("addBatchJob", [this] (const NativeArguments& arguments, NativeCompletion completion)
    {
        completion(batchProcessor.addJob(getStringArgument(arguments, 0), getStringArgument(arguments, 1)));
    });

    options = options.withNativeFunction("startBatch", [this] (const NativeArguments&, NativeCompletion completion)
    {
        completion(batchProcessor.startBatch(currentChainJson.isNotEmpty() ? currentChainJson : previewChain.toJson()));
    });

    options = options.withNativeFunction("getProgress", [this] (const NativeArguments&, NativeCompletion completion)
    {
        completion(progressSnapshotToVar(batchProcessor.getProgress()));
    });

    options = options.withNativeFunction("cancelBatch", [this] (const NativeArguments&, NativeCompletion completion)
    {
        completion(batchProcessor.cancelBatch());
    });

    return options;
}

void JSBridge::attachBrowser(juce::WebBrowserComponent& browserToAttach)
{
    browser = &browserToAttach;
}

juce::String JSBridge::getStringArgument(const NativeArguments& arguments, int index)
{
    if (juce::isPositiveAndBelow(index, arguments.size()))
        return arguments.getReference(index).toString();

    return {};
}

juce::var JSBridge::stringArrayToVar(const juce::StringArray& values)
{
    juce::Array<juce::var> array;

    for (const auto& value : values)
        array.add(value);

    return juce::var(array);
}

juce::var JSBridge::pluginArrayToVar(const juce::Array<PluginInfo>& plugins)
{
    juce::Array<juce::var> array;

    for (const auto& plugin : plugins)
        array.add(pluginInfoToVar(plugin));

    return juce::var(array);
}

juce::var JSBridge::savedChainsToVar(const juce::Array<SavedChain>& chains)
{
    juce::Array<juce::var> array;

    for (const auto& chain : chains)
        array.add(savedChainToVar(chain));

    return juce::var(array);
}

void JSBridge::emitProgressEvent(const BatchJob& job, bool done)
{
    if (browser == nullptr)
        return;

    const auto payload = makeObject({
        { "type", "progress.update" },
        { "jobId", job.id },
        { "file", job.inputFile },
        { "percent", job.progress },
        { "done", done }
    });

    juce::MessageManager::callAsync([attachedBrowser = browser, payload]
    {
        if (attachedBrowser != nullptr)
            attachedBrowser->emitEventIfBrowserIsVisible(juce::Identifier("progress.update"), payload);
    });
}

void JSBridge::emitBatchDoneEvent(int totalFiles, double elapsedSeconds)
{
    if (browser == nullptr)
        return;

    const auto payload = makeObject({
        { "type", "batch.done" },
        { "totalFiles", totalFiles },
        { "elapsed", elapsedSeconds }
    });

    juce::MessageManager::callAsync([attachedBrowser = browser, payload]
    {
        if (attachedBrowser != nullptr)
            attachedBrowser->emitEventIfBrowserIsVisible(juce::Identifier("batch.done"), payload);
    });
}
} // namespace batchmaster
