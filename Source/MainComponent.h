#pragma once

#include <JuceHeader.h>

#include "bridge/JSBridge.h"

class MainComponent final : public juce::Component
{
public:
    MainComponent();
    ~MainComponent() override = default;

    void resized() override;

private:
    using Resource = juce::WebBrowserComponent::Resource;

    std::optional<Resource> getResource(const juce::String& path);
    juce::String getStartupUrl() const;
    static juce::String getMimeTypeForPath(const juce::String& path);
    static juce::String normalisePath(const juce::String& path);
    static juce::String findBinaryResourceName(const juce::String& requestedPath);

    batchmaster::JSBridge bridge;
    std::unique_ptr<juce::WebBrowserComponent> browser;
};
