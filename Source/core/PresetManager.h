#pragma once

#include <JuceHeader.h>

#include "BatchTypes.h"

namespace batchmaster
{
class PluginScanner;

class PresetManager
{
public:
    juce::StringArray loadPresets(PluginScanner& scanner, const PluginInfo& plugin) const;
    bool loadPresetFile(const juce::String& pluginId, const juce::String& filePath) const;
    bool applyPreset(juce::AudioPluginInstance& plugin, const ChainItem& item) const;

private:
    juce::Array<juce::File> getPresetRoots() const;
};
} // namespace batchmaster
