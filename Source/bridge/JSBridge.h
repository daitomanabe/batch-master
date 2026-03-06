#pragma once

#include <JuceHeader.h>

#include "../core/BatchProcessor.h"
#include "../core/PluginChain.h"
#include "../core/PluginScanner.h"
#include "../core/PresetManager.h"
#include "../io/ChainSerializer.h"

namespace batchmaster
{
class JSBridge
{
public:
    JSBridge();

    juce::WebBrowserComponent::Options extendOptions(juce::WebBrowserComponent::Options options);
    void attachBrowser(juce::WebBrowserComponent& browserToAttach);

private:
    using NativeArguments = juce::Array<juce::var>;
    using NativeCompletion = juce::WebBrowserComponent::NativeFunctionCompletion;

    static juce::String getStringArgument(const NativeArguments& arguments, int index);
    static juce::var stringArrayToVar(const juce::StringArray& values);
    static juce::var pluginArrayToVar(const juce::Array<PluginInfo>& plugins);
    static juce::var savedChainsToVar(const juce::Array<SavedChain>& chains);

    void emitProgressEvent(const BatchJob& job, bool done);
    void emitBatchDoneEvent(int totalFiles, double elapsedSeconds);

    PluginScanner scanner;
    PresetManager presetManager;
    PluginChain previewChain;
    ChainSerializer serializer;
    BatchProcessor batchProcessor;
    juce::WebBrowserComponent* browser = nullptr;
    juce::String currentChainJson;
};
} // namespace batchmaster
