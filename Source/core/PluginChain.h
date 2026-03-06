#pragma once

#include <JuceHeader.h>

#include "BatchTypes.h"

namespace batchmaster
{
class PluginScanner;
class PresetManager;

class PluginChain
{
public:
    PluginChain(PluginScanner& scanner, PresetManager& presetManager);
    ~PluginChain();

    juce::Result loadFromJson(const juce::String& chainJson);
    juce::String toJson() const;

    const juce::Array<ChainItem>& getItems() const noexcept;

    juce::Result prepare(double sampleRate, int blockSize, int numChannels);
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages);
    void release();

    int getLatencySamples() const noexcept;
    double getTailLengthSeconds() const noexcept;

private:
    PluginScanner& scanner;
    PresetManager& presetManager;
    juce::Array<ChainItem> items;
    std::vector<std::unique_ptr<juce::AudioPluginInstance>> instances;
    int latencySamples = 0;
    double tailLengthSeconds = 0.0;
};
} // namespace batchmaster
