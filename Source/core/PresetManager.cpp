#include "PresetManager.h"

#include "PluginScanner.h"

namespace batchmaster
{
juce::StringArray PresetManager::loadPresets(PluginScanner& scanner, const PluginInfo& plugin) const
{
    juce::StringArray presets;
    ChainItem item;
    item.pluginId = plugin.id;
    item.pluginPath = plugin.path;
    item.name = plugin.name;

    juce::String errorMessage;
    auto instance = scanner.createPluginInstance(item, 44100.0, 512, errorMessage);

    if (instance != nullptr)
    {
        const auto numPrograms = instance->getNumPrograms();

        for (int program = 0; program < numPrograms; ++program)
        {
            const auto programName = instance->getProgramName(program).trim();

            if (programName.isNotEmpty())
                presets.addIfNotAlreadyThere(programName);
        }
    }

    for (const auto& root : getPresetRoots())
    {
        if (! root.exists())
            continue;

        for (const auto& entry : juce::RangedDirectoryIterator(root, true, "*.vstpreset", juce::File::findFiles))
        {
            const auto file = entry.getFile();
            const auto lowerPath = file.getFullPathName().toLowerCase();

            if (lowerPath.contains(plugin.name.toLowerCase()) || lowerPath.contains(plugin.vendor.toLowerCase()))
                presets.addIfNotAlreadyThere(file.getFileNameWithoutExtension());
        }
    }

    presets.sort(true);
    return presets;
}

bool PresetManager::loadPresetFile(const juce::String& /*pluginId*/, const juce::String& filePath) const
{
    const juce::File file(filePath);
    return file.existsAsFile() && file.hasFileExtension(".vstpreset");
}

bool PresetManager::applyPreset(juce::AudioPluginInstance& plugin, const ChainItem& item) const
{
    if (item.preset.isNotEmpty() && item.preset != "__file__")
    {
        const auto numPrograms = plugin.getNumPrograms();

        for (int program = 0; program < numPrograms; ++program)
        {
            if (plugin.getProgramName(program) == item.preset)
            {
                plugin.setCurrentProgram(program);
                return true;
            }
        }
    }

    if (item.presetFilePath.isNotEmpty())
        return loadPresetFile(item.pluginId, item.presetFilePath);

    return false;
}

juce::Array<juce::File> PresetManager::getPresetRoots() const
{
    juce::Array<juce::File> roots;
    const auto userHome = juce::File::getSpecialLocation(juce::File::userHomeDirectory);

   #if JUCE_MAC
    roots.add(userHome.getChildFile("Library/Audio/Presets"));
    roots.add(juce::File("/Library/Audio/Presets"));
   #elif JUCE_WINDOWS
    roots.add(userHome.getChildFile("Documents/VST3 Presets"));
   #endif

    return roots;
}
} // namespace batchmaster
