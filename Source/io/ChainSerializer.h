#pragma once

#include <JuceHeader.h>

#include "../core/BatchTypes.h"

namespace batchmaster
{
class ChainSerializer
{
public:
    ChainSerializer();

    juce::Result saveChain(const juce::String& name, const juce::String& chainJson) const;
    juce::Array<SavedChain> getSavedChains() const;

private:
    juce::File getChainsDirectory() const;
    static juce::String sanitiseFileStem(const juce::String& name);
};
} // namespace batchmaster
