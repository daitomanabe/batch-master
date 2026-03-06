#include "ChainSerializer.h"

namespace batchmaster
{
ChainSerializer::ChainSerializer()
{
    getChainsDirectory().createDirectory();
}

juce::Result ChainSerializer::saveChain(const juce::String& name, const juce::String& chainJson) const
{
    juce::Array<ChainItem> items;
    const auto parseResult = parseChainItemsFromJson(chainJson, items);

    if (parseResult.failed())
        return parseResult;

    auto* root = new juce::DynamicObject();
    root->setProperty("version", 1);
    root->setProperty("name", name);
    root->setProperty("createdAt", makeIsoTimestamp());

    juce::Array<juce::var> chainValues;

    for (const auto& item : items)
    {
        auto chainValue = chainItemToVar(item);

        if (auto* object = chainValue.getDynamicObject())
            object->removeProperty("uid");

        chainValues.add(chainValue);
    }

    root->setProperty("chain", juce::var(chainValues));

    const auto fileName = sanitiseFileStem(name) + ".bmchain.json";
    const auto targetFile = getChainsDirectory().getChildFile(fileName);

    if (! targetFile.replaceWithText(juce::JSON::toString(juce::var(root), true)))
        return juce::Result::fail("Could not write chain file.");

    return juce::Result::ok();
}

juce::Array<SavedChain> ChainSerializer::getSavedChains() const
{
    juce::Array<SavedChain> chains;
    const auto directory = getChainsDirectory();

    if (! directory.exists())
        return chains;

    for (const auto& entry : juce::RangedDirectoryIterator(directory, false, "*.bmchain.json", juce::File::findFiles))
    {
        juce::var parsed;
        const auto parseResult = juce::JSON::parse(entry.getFile().loadFileAsString(), parsed);

        if (parseResult.failed())
            continue;

        const auto* object = parsed.getDynamicObject();

        if (object == nullptr)
            continue;

        SavedChain chain;
        chain.name = object->getProperty("name").toString();
        chain.createdAt = object->getProperty("createdAt").toString();

        if (parseChainItemsFromVar(parsed, chain.chain).wasOk())
            chains.add(chain);
    }

    std::sort(chains.begin(), chains.end(), [] (const SavedChain& left, const SavedChain& right)
    {
        return left.createdAt > right.createdAt;
    });

    return chains;
}

juce::File ChainSerializer::getChainsDirectory() const
{
    return juce::File::getSpecialLocation(juce::File::userHomeDirectory)
        .getChildFile("Library/Application Support/BatchMaster/chains");
}

juce::String ChainSerializer::sanitiseFileStem(const juce::String& name)
{
    auto stem = name.trim().toLowerCase();
    stem = stem.retainCharacters("abcdefghijklmnopqrstuvwxyz0123456789-_ ");
    stem = stem.replaceCharacters(" ", "-");

    if (stem.isEmpty())
        stem = "chain-" + juce::Time::getCurrentTime().formatted("%Y%m%d%H%M%S");

    return stem;
}
} // namespace batchmaster
