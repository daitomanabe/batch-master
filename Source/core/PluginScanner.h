#pragma once

#include <JuceHeader.h>

#include <set>

#include "BatchTypes.h"

namespace batchmaster
{
class PluginScanner
{
public:
    static juce::String getFixedScanRoot();

    PluginScanner();

    void setLogCallback(std::function<void(const juce::String&)> callback);
    juce::Array<PluginInfo> scanPlugins(const juce::String& folderPath);
    const juce::Array<PluginInfo>& getCachedPlugins() const noexcept;
    std::optional<PluginInfo> findPlugin(const juce::String& pluginId) const;
    std::unique_ptr<juce::AudioPluginInstance> createPluginInstance(const ChainItem& item,
                                                                    double sampleRate,
                                                                    int blockSize,
                                                                    juce::String& errorMessage);

private:
    juce::File getCacheFile() const;
    void loadCacheFromDisk();
    void saveCacheToDisk() const;
    juce::Array<juce::File> getDefaultSearchRoots() const;
    void scanRoot(const juce::File& root,
                  juce::Array<PluginInfo>& discovered,
                  std::set<juce::String>& seenPaths);
    bool isPluginCandidate(const juce::File& file) const;
    juce::Array<juce::PluginDescription> describePluginFile(const juce::File& file) const;
    static juce::String deriveCategory(const juce::String& rawCategory, const juce::String& name);
    void log(const juce::String& line) const;

    juce::AudioPluginFormatManager formatManager;
    juce::KnownPluginList knownPlugins;
    juce::Array<PluginInfo> cachedPlugins;
    std::function<void(const juce::String&)> logCallback;
};
} // namespace batchmaster
