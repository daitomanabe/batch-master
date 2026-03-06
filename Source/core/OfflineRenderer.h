#pragma once

#include <JuceHeader.h>

namespace batchmaster
{
class PluginChain;

class OfflineRenderer
{
public:
    OfflineRenderer();

    juce::Result render(const juce::File& inputFile,
                        const juce::File& outputFile,
                        PluginChain& chain,
                        const std::function<void(double)>& progressCallback,
                        std::atomic_bool& cancelRequested);

private:
    static constexpr int blockSize = 4096;

    juce::AudioFormatManager formatManager;
};
} // namespace batchmaster
