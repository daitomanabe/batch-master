#include "PluginScanner.h"

namespace batchmaster
{
juce::String PluginScanner::getFixedScanRoot()
{
   #if JUCE_MAC
    return "/Library/Audio/Plug-Ins/VST3";
   #elif JUCE_WINDOWS
    return "C:\\Program Files\\Common Files\\VST3";
   #else
    return {};
   #endif
}

PluginScanner::PluginScanner()
{
   #if JUCE_PLUGINHOST_VST3
    formatManager.addFormat(std::make_unique<juce::VST3PluginFormat>());
   #endif

   #if JUCE_MAC && JUCE_PLUGINHOST_AU
    formatManager.addFormat(std::make_unique<juce::AudioUnitPluginFormat>());
   #endif
}

juce::Array<PluginInfo> PluginScanner::scanPlugins(const juce::String& folderPath)
{
    juce::Array<PluginInfo> discovered;
    std::set<juce::String> seenPaths;

    juce::Array<juce::File> roots;
    juce::ignoreUnused(folderPath);
    roots = getDefaultSearchRoots();

    for (const auto& root : roots)
        scanRoot(root, discovered, seenPaths);

    std::sort(discovered.begin(), discovered.end(), [] (const PluginInfo& left, const PluginInfo& right)
    {
        return left.name.compareIgnoreCase(right.name) < 0;
    });

    cachedPlugins = discovered;
    return cachedPlugins;
}

const juce::Array<PluginInfo>& PluginScanner::getCachedPlugins() const noexcept
{
    return cachedPlugins;
}

std::optional<PluginInfo> PluginScanner::findPlugin(const juce::String& pluginId) const
{
    for (const auto& plugin : cachedPlugins)
        if (plugin.id == pluginId)
            return plugin;

    return std::nullopt;
}

std::unique_ptr<juce::AudioPluginInstance> PluginScanner::createPluginInstance(const ChainItem& item,
                                                                               double sampleRate,
                                                                               int blockSize,
                                                                               juce::String& errorMessage)
{
    juce::String pluginPath = item.pluginPath;

    if (pluginPath.isEmpty())
        if (const auto plugin = findPlugin(item.pluginId))
            pluginPath = plugin->path;

    if (pluginPath.isEmpty())
    {
        errorMessage = "Plugin path could not be resolved.";
        return {};
    }

    const auto descriptions = describePluginFile(juce::File(pluginPath));

    if (descriptions.isEmpty())
    {
        errorMessage = "No plugin description was produced for " + pluginPath;
        return {};
    }

    for (const auto& description : descriptions)
    {
        juce::String localError;
        auto instance = formatManager.createPluginInstance(description, sampleRate, blockSize, localError);

        if (instance != nullptr)
            return instance;

        if (errorMessage.isEmpty())
            errorMessage = localError;
    }

    if (errorMessage.isEmpty())
        errorMessage = "Failed to instantiate " + pluginPath;

    return {};
}

juce::Array<juce::File> PluginScanner::getDefaultSearchRoots() const
{
    juce::Array<juce::File> roots;
    const auto fixedRoot = getFixedScanRoot();

    if (fixedRoot.isNotEmpty())
        roots.add(juce::File(fixedRoot));

    return roots;
}

void PluginScanner::scanRoot(const juce::File& root,
                             juce::Array<PluginInfo>& discovered,
                             std::set<juce::String>& seenPaths)
{
    if (! root.exists())
        return;

    for (const auto& entry : juce::RangedDirectoryIterator(root, true, "*", juce::File::findFilesAndDirectories))
    {
        const auto file = entry.getFile();

        if (! isPluginCandidate(file))
            continue;

        const auto path = file.getFullPathName();

        if (seenPaths.find(path) != seenPaths.end())
            continue;

        seenPaths.insert(path);

        const auto descriptions = describePluginFile(file);

        if (descriptions.isEmpty())
        {
            PluginInfo fallback;
            fallback.id = buildPluginId(path);
            fallback.name = file.getFileNameWithoutExtension();
            fallback.vendor = "Unknown";
            fallback.category = deriveCategory({}, fallback.name);
            fallback.path = path;
            fallback.hasPresets = true;
            discovered.add(fallback);
            continue;
        }

        const auto& description = descriptions.getReference(0);
        knownPlugins.addType(description);

        PluginInfo plugin;
        plugin.id = buildPluginId(path);
        plugin.name = description.name.isNotEmpty() ? description.name : file.getFileNameWithoutExtension();
        plugin.vendor = description.manufacturerName.isNotEmpty() ? description.manufacturerName : "Unknown";
        plugin.category = deriveCategory(description.category, plugin.name);
        plugin.path = path;
        plugin.hasPresets = true;
        discovered.add(plugin);
    }
}

bool PluginScanner::isPluginCandidate(const juce::File& file) const
{
    if (! file.exists())
        return false;

    const auto path = file.getFullPathName();

   #if JUCE_MAC
    return path.endsWithIgnoreCase(".vst3");
   #else
    return path.endsWithIgnoreCase(".vst3");
   #endif
}

juce::Array<juce::PluginDescription> PluginScanner::describePluginFile(const juce::File& file) const
{
    juce::Array<juce::PluginDescription> descriptions;

    for (int index = 0; index < formatManager.getNumFormats(); ++index)
    {
        auto* format = formatManager.getFormat(index);

        if (format == nullptr || ! format->fileMightContainThisPluginType(file.getFullPathName()))
            continue;

        juce::OwnedArray<juce::PluginDescription> found;
        format->findAllTypesForFile(found, file.getFullPathName());

        for (const auto* description : found)
            descriptions.add(*description);

        if (! descriptions.isEmpty())
            break;
    }

    return descriptions;
}

juce::String PluginScanner::deriveCategory(const juce::String& rawCategory, const juce::String& name)
{
    const auto haystack = (rawCategory + " " + name).toLowerCase();

    if (haystack.contains("limit"))
        return "Limiter";

    if (haystack.contains("compress"))
        return "Compressor";

    if (haystack.contains("eq"))
        return "EQ";

    if (haystack.contains("master"))
        return "Mastering";

    if (haystack.contains("reverb"))
        return "Reverb";

    if (haystack.contains("delay"))
        return "Delay";

    if (rawCategory.isNotEmpty())
        return rawCategory;

    return "Utility";
}
} // namespace batchmaster
