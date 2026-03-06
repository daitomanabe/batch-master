#pragma once

#include <JuceHeader.h>

#include <set>

#include "BatchTypes.h"

namespace batchmaster
{
class PluginScanner
{
public:
    PluginScanner();

    juce::Array<PluginInfo> scanPlugins(const juce::String& folderPath);
    const juce::Array<PluginInfo>& getCachedPlugins() const noexcept;
    std::optional<PluginInfo> findPlugin(const juce::String& pluginId) const;
    std::unique_ptr<juce::AudioPluginInstance> createPluginInstance(const ChainItem& item,
                                                                    double sampleRate,
                                                                    int blockSize,
                                                                    juce::String& errorMessage);

private:
    juce::Array<juce::File> getDefaultSearchRoots() const;
    void scanRoot(const juce::File& root,
                  juce::Array<PluginInfo>& discovered,
                  std::set<juce::String>& seenPaths);
    bool isPluginCandidate(const juce::File& file) const;
    juce::Array<juce::PluginDescription> describePluginFile(const juce::File& file) const;
    static juce::String deriveCategory(const juce::String& rawCategory, const juce::String& name);

    juce::AudioPluginFormatManager formatManager;
    juce::KnownPluginList knownPlugins;
    juce::Array<PluginInfo> cachedPlugins;
};
} // namespace batchmaster
