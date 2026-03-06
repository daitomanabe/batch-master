#include "OfflineRenderer.h"

#include "PluginChain.h"

namespace batchmaster
{
OfflineRenderer::OfflineRenderer()
{
    formatManager.registerBasicFormats();
}

juce::Result OfflineRenderer::render(const juce::File& inputFile,
                                     const juce::File& outputFile,
                                     PluginChain& chain,
                                     const std::function<void(double)>& progressCallback,
                                     std::atomic_bool& cancelRequested)
{
    if (! inputFile.existsAsFile())
        return juce::Result::fail("Input file does not exist.");

    std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(inputFile));

    if (reader == nullptr)
        return juce::Result::fail("Unsupported input audio file.");

    const auto numInputChannels = static_cast<int>(reader->numChannels);
    const auto outputChannels = juce::jmax(2, numInputChannels);
    const auto totalInputSamples = reader->lengthInSamples;

    const auto prepareResult = chain.prepare(reader->sampleRate, blockSize, outputChannels);

    if (prepareResult.failed())
        return prepareResult;

    auto parentDirectory = outputFile.getParentDirectory();

    if (! parentDirectory.exists())
        parentDirectory.createDirectory();

    std::unique_ptr<juce::OutputStream> stream(outputFile.createOutputStream());

    if (stream == nullptr)
    {
        chain.release();
        return juce::Result::fail("Could not create output file.");
    }

    juce::WavAudioFormat wavFormat;
    const auto writerOptions = juce::AudioFormatWriterOptions {}
        .withSampleRate(reader->sampleRate)
        .withNumChannels(outputChannels)
        .withBitsPerSample(32)
        .withSampleFormat(juce::AudioFormatWriterOptions::SampleFormat::floatingPoint);

    std::unique_ptr<juce::AudioFormatWriter> writer(wavFormat.createWriterFor(stream, writerOptions));

    if (writer == nullptr)
    {
        chain.release();
        return juce::Result::fail("Could not create WAV writer.");
    }

    juce::AudioBuffer<float> buffer(outputChannels, blockSize);
    juce::MidiBuffer midiMessages;

    int remainingLatency = chain.getLatencySamples();

    while (remainingLatency > 0)
    {
        if (cancelRequested.load())
        {
            chain.release();
            return juce::Result::fail("Cancelled");
        }

        buffer.clear();
        midiMessages.clear();
        chain.processBlock(buffer, midiMessages);
        remainingLatency -= blockSize;
    }

    juce::int64 position = 0;

    while (position < totalInputSamples)
    {
        if (cancelRequested.load())
        {
            chain.release();
            return juce::Result::fail("Cancelled");
        }

        const auto numThisTime = static_cast<int>(juce::jmin<juce::int64>(blockSize, totalInputSamples - position));
        buffer.clear();
        midiMessages.clear();
        reader->read(&buffer, 0, numThisTime, position, true, true);

        if (numInputChannels == 1 && outputChannels > 1)
            for (int channel = 1; channel < outputChannels; ++channel)
                buffer.copyFrom(channel, 0, buffer, 0, 0, numThisTime);

        chain.processBlock(buffer, midiMessages);
        writer->writeFromAudioSampleBuffer(buffer, 0, numThisTime);

        position += numThisTime;

        if (progressCallback)
            progressCallback(static_cast<double>(position) / static_cast<double>(juce::jmax<juce::int64>(1, totalInputSamples)));
    }

    auto remainingTailSamples = static_cast<juce::int64>(std::ceil(chain.getTailLengthSeconds() * reader->sampleRate));

    while (remainingTailSamples > 0)
    {
        if (cancelRequested.load())
        {
            chain.release();
            return juce::Result::fail("Cancelled");
        }

        buffer.clear();
        midiMessages.clear();
        chain.processBlock(buffer, midiMessages);

        const auto numThisTime = static_cast<int>(juce::jmin<juce::int64>(blockSize, remainingTailSamples));
        writer->writeFromAudioSampleBuffer(buffer, 0, numThisTime);
        remainingTailSamples -= numThisTime;
    }

    if (progressCallback)
        progressCallback(1.0);

    chain.release();
    return juce::Result::ok();
}
} // namespace batchmaster
