#include "PluginChain.h"

#include "PluginScanner.h"
#include "PresetManager.h"

namespace batchmaster
{
PluginChain::PluginChain(PluginScanner& scannerToUse, PresetManager& presetManagerToUse)
    : scanner(scannerToUse), presetManager(presetManagerToUse)
{
}

PluginChain::~PluginChain()
{
    release();
}

juce::Result PluginChain::loadFromJson(const juce::String& chainJson)
{
    juce::Array<ChainItem> parsedItems;
    const auto result = parseChainItemsFromJson(chainJson, parsedItems);

    if (result.failed())
        return result;

    items = parsedItems;
    return juce::Result::ok();
}

juce::String PluginChain::toJson() const
{
    return chainItemsToJson(items, true);
}

const juce::Array<ChainItem>& PluginChain::getItems() const noexcept
{
    return items;
}

juce::Result PluginChain::prepare(double sampleRate, int blockSize, int /*numChannels*/)
{
    release();

    latencySamples = 0;
    tailLengthSeconds = 0.0;

    for (const auto& item : items)
    {
        if (! item.enabled)
            continue;

        juce::String errorMessage;
        auto instance = scanner.createPluginInstance(item, sampleRate, blockSize, errorMessage);

        if (instance == nullptr)
            return juce::Result::fail(errorMessage.isNotEmpty() ? errorMessage : "Failed to create plugin instance.");

        instance->setNonRealtime(true);
        instance->prepareToPlay(sampleRate, blockSize);
        presetManager.applyPreset(*instance, item);

        latencySamples += instance->getLatencySamples();
        tailLengthSeconds += juce::jmax(0.0, instance->getTailLengthSeconds());
        instances.push_back(std::move(instance));
    }

    return juce::Result::ok();
}

void PluginChain::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    for (auto& instance : instances)
        instance->processBlock(buffer, midiMessages);
}

void PluginChain::release()
{
    for (auto& instance : instances)
        instance->releaseResources();

    instances.clear();
    latencySamples = 0;
    tailLengthSeconds = 0.0;
}

int PluginChain::getLatencySamples() const noexcept
{
    return latencySamples;
}

double PluginChain::getTailLengthSeconds() const noexcept
{
    return tailLengthSeconds;
}
} // namespace batchmaster
