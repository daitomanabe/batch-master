cmake_minimum_required(VERSION 3.22)

project(BatchMaster VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING "Minimum macOS deployment target" FORCE)

option(BM_ENABLE_WEBVIEW "Enable JUCE WebBrowserComponent support" ON)

include(FetchContent)

FetchContent_Declare(
  JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG 8.0.12
)

FetchContent_MakeAvailable(JUCE)

set(BM_UI_DIST_DIR ${CMAKE_CURRENT_SOURCE_DIR}/ui/dist)
set(BM_UI_INDEX_HTML ${BM_UI_DIST_DIR}/index.html)
set(BM_UI_INDEX_JS ${BM_UI_DIST_DIR}/assets/index.js)
set(BM_UI_INDEX_CSS ${BM_UI_DIST_DIR}/assets/index.css)

if(NOT EXISTS ${BM_UI_INDEX_HTML} OR NOT EXISTS ${BM_UI_INDEX_JS} OR NOT EXISTS ${BM_UI_INDEX_CSS})
  message(FATAL_ERROR "UI build artifacts are missing. Run `npm install && npm run build` inside ui/ first.")
endif()

juce_add_binary_data(UIResources SOURCES
  ${BM_UI_INDEX_HTML}
  ${BM_UI_INDEX_JS}
  ${BM_UI_INDEX_CSS}
)

juce_add_gui_app(BatchMaster
  PRODUCT_NAME "BatchMaster"
  COMPANY_NAME "Rhizoma"
  VERSION "0.1.0"
  BUNDLE_ID "com.rhizoma.batchmaster"
)

juce_generate_juce_header(BatchMaster)

target_sources(BatchMaster PRIVATE
  Source/Main.cpp
  Source/MainComponent.cpp
  Source/MainComponent.h
  Source/core/BatchTypes.h
  Source/core/BatchProcessor.cpp
  Source/core/BatchProcessor.h
  Source/core/OfflineRenderer.cpp
  Source/core/OfflineRenderer.h
  Source/core/PluginChain.cpp
  Source/core/PluginChain.h
  Source/core/PluginScanner.cpp
  Source/core/PluginScanner.h
  Source/core/PresetManager.cpp
  Source/core/PresetManager.h
  Source/bridge/JSBridge.cpp
  Source/bridge/JSBridge.h
  Source/io/ChainSerializer.cpp
  Source/io/ChainSerializer.h
)

target_compile_definitions(BatchMaster PRIVATE
  JUCE_WEB_BROWSER=$<BOOL:${BM_ENABLE_WEBVIEW}>
  JUCE_USE_CURL=0
  JUCE_PLUGINHOST_VST3=1
  JUCE_PLUGINHOST_AU=1
  JUCE_MODAL_LOOPS_PERMITTED=1
  JUCE_STRICT_REFCOUNTEDPOINTER=1
)

target_link_libraries(BatchMaster PRIVATE
  UIResources
  juce::juce_audio_basics
  juce::juce_audio_devices
  juce::juce_audio_formats
  juce::juce_audio_processors
  juce::juce_core
  juce::juce_data_structures
  juce::juce_events
  juce::juce_graphics
  juce::juce_gui_basics
  juce::juce_gui_extra
  juce::juce_recommended_config_flags
  juce::juce_recommended_lto_flags
  juce::juce_recommended_warning_flags
)

if(APPLE)
  find_library(AUDIO_UNIT_FRAMEWORK AudioUnit REQUIRED)
  find_library(AUDIO_TOOLBOX_FRAMEWORK AudioToolbox REQUIRED)
  find_library(CORE_AUDIO_FRAMEWORK CoreAudio REQUIRED)
  find_library(CORE_AUDIO_KIT_FRAMEWORK CoreAudioKit REQUIRED)

  target_link_libraries(BatchMaster PRIVATE
    ${AUDIO_UNIT_FRAMEWORK}
    ${AUDIO_TOOLBOX_FRAMEWORK}
    ${CORE_AUDIO_FRAMEWORK}
    ${CORE_AUDIO_KIT_FRAMEWORK}
  )
endif()

target_include_directories(BatchMaster PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/Source
)
