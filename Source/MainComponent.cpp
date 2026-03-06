#include "MainComponent.h"

#include <BinaryData.h>

namespace
{
std::vector<std::byte> makeResourceBytes(const char* data, int size)
{
    const auto* begin = reinterpret_cast<const std::byte*>(data);
    return { begin, begin + size };
}
} // namespace

MainComponent::MainComponent()
{
    auto options = juce::WebBrowserComponent::Options{};
    options = bridge.extendOptions(options);
    options = options.withResourceProvider([this] (const juce::String& path)
    {
        return getResource(path);
    });

    browser = std::make_unique<juce::WebBrowserComponent>(options);
    bridge.attachBrowser(*browser);
    addAndMakeVisible(*browser);

    browser->goToURL(getStartupUrl());
    setSize(1440, 960);
}

void MainComponent::resized()
{
    if (browser != nullptr)
        browser->setBounds(getLocalBounds());
}

std::optional<MainComponent::Resource> MainComponent::getResource(const juce::String& path)
{
    const auto requestedPath = normalisePath(path);
    const auto resourceName = findBinaryResourceName(requestedPath);

    if (resourceName.isEmpty())
        return std::nullopt;

    int dataSize = 0;
    const auto* data = BinaryData::getNamedResource(resourceName.toRawUTF8(), dataSize);

    if (data == nullptr || dataSize <= 0)
        return std::nullopt;

    return Resource { makeResourceBytes(data, dataSize), getMimeTypeForPath(requestedPath) };
}

juce::String MainComponent::getStartupUrl() const
{
    if (const auto* env = std::getenv("BM_UI_DEV_URL"))
        return juce::String(env);

    return juce::WebBrowserComponent::getResourceProviderRoot() + "/index.html";
}

juce::String MainComponent::getMimeTypeForPath(const juce::String& path)
{
    if (path.endsWithIgnoreCase(".js"))
        return "text/javascript";

    if (path.endsWithIgnoreCase(".css"))
        return "text/css";

    if (path.endsWithIgnoreCase(".svg"))
        return "image/svg+xml";

    return "text/html";
}

juce::String MainComponent::normalisePath(const juce::String& path)
{
    auto normalised = path;

    if (const auto queryIndex = normalised.indexOfChar('?'); queryIndex >= 0)
        normalised = normalised.substring(0, queryIndex);

    if (const auto hashIndex = normalised.indexOfChar('#'); hashIndex >= 0)
        normalised = normalised.substring(0, hashIndex);

    if (normalised.isEmpty() || normalised == "/")
        return "/index.html";

    return normalised.startsWithChar('/') ? normalised : "/" + normalised;
}

juce::String MainComponent::findBinaryResourceName(const juce::String& requestedPath)
{
    const auto target = requestedPath.substring(1);
    const auto leafName = target.fromLastOccurrenceOf("/", false, false);
    const auto sanitisedTarget = target.replaceCharacter('/', '_').replaceCharacter('.', '_');
    const auto sanitisedLeafName = leafName.replaceCharacter('.', '_');

    for (int index = 0; index < BinaryData::namedResourceListSize; ++index)
    {
        const auto resourceName = juce::String(BinaryData::namedResourceList[index]);
        const auto originalFilename = juce::String(BinaryData::originalFilenames[index]);

        if (resourceName == target
            || resourceName == sanitisedLeafName
            || resourceName == leafName
            || resourceName.endsWithIgnoreCase(sanitisedTarget))
        {
            return resourceName;
        }

        if (originalFilename == target || originalFilename == leafName)
            return resourceName;
    }

    return {};
}
