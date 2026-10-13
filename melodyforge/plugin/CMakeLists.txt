cmake_minimum_required(VERSION 3.22)

project(MelodyForgeISLAND27 VERSION 2.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(MELODYFORGE_BUILD_PLUGIN "Build the VST3/Standalone plugin (needs JUCE)" ON)
option(MELODYFORGE_BUILD_TESTS "Build the C++ core golden test" ON)
option(MELODYFORGE_FETCH_JUCE "Download JUCE if it is not installed" ON)

set(REPO_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../..)

if(MELODYFORGE_BUILD_TESTS)
    enable_testing()
    add_executable(mf_golden_test tests/golden_test.cpp)
    add_test(NAME mf_golden_test COMMAND mf_golden_test ${CMAKE_CURRENT_SOURCE_DIR}/../tests/golden/golden.txt)
endif()

if(MELODYFORGE_BUILD_PLUGIN)
    find_package(JUCE CONFIG QUIET)
    if(NOT JUCE_FOUND)
        if(NOT MELODYFORGE_FETCH_JUCE)
            message(FATAL_ERROR "JUCE not found. Install it or enable MELODYFORGE_FETCH_JUCE.")
        endif()
        include(FetchContent)
        FetchContent_Declare(JUCE
            GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
            GIT_TAG 7.0.12
            GIT_SHALLOW TRUE)
        FetchContent_MakeAvailable(JUCE)
    endif()

    set(MF_FORMATS VST3 Standalone)
    if(APPLE)
        list(APPEND MF_FORMATS AU)
    endif()

    juce_add_plugin(MelodyForge
        COMPANY_NAME "Island27"
        BUNDLE_ID "com.island27.melodyforge"
        PLUGIN_MANUFACTURER_CODE Isl7
        PLUGIN_CODE Mfg7
        FORMATS ${MF_FORMATS}
        PRODUCT_NAME "MelodyForge ISLAND27"
        IS_SYNTH TRUE
        NEEDS_MIDI_INPUT TRUE
        NEEDS_MIDI_OUTPUT TRUE
        IS_MIDI_EFFECT FALSE
        EDITOR_WANTS_KEYBOARD_FOCUS TRUE
        VST3_CATEGORIES Instrument Generator
        AU_MAIN_TYPE kAudioUnitType_MusicDevice
        ICON_BIG "${REPO_ROOT}/resources/icon.png"
        COPY_PLUGIN_AFTER_BUILD FALSE)

    # Same ISLAND27 assets (logo, fonts) as the Island Parametric EQ
    juce_add_binary_data(MelodyForgeAssets
        HEADER_NAME IslandAssets.h
        NAMESPACE IslandAssets
        SOURCES
            ${REPO_ROOT}/resources/logo.png
            ${REPO_ROOT}/resources/banner_bg.jpg
            ${REPO_ROOT}/resources/SpaceGrotesk-Bold.ttf
            ${REPO_ROOT}/resources/IBMPlexSans-Regular.ttf
            ${REPO_ROOT}/resources/IBMPlexSans-SemiBold.ttf)
    set_target_properties(MelodyForgeAssets PROPERTIES POSITION_INDEPENDENT_CODE ON)

    target_sources(MelodyForge PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp)
    target_include_directories(MelodyForge PRIVATE Source ${REPO_ROOT}/src/plugin)

    target_compile_definitions(MelodyForge PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0)

    # Distribution JUCE packages without the bundled zlib/libpng/libjpeg (see
    # scripts/build-windows-mingw.sh) can point this at static builds of them.
    set(MELODYFORGE_EXTERNAL_LIBS_PREFIX "" CACHE PATH "Prefix with static zlib/libpng/libjpeg for JUCE")
    if(MELODYFORGE_EXTERNAL_LIBS_PREFIX)
        target_compile_definitions(MelodyForge PUBLIC
            JUCE_INCLUDE_ZLIB_CODE=0 JUCE_INCLUDE_PNGLIB_CODE=0 JUCE_INCLUDE_JPEGLIB_CODE=0
            JUCE_USE_FLAC=0 JUCE_USE_OGGVORBIS=0)
        target_include_directories(MelodyForge PUBLIC "${MELODYFORGE_EXTERNAL_LIBS_PREFIX}/include")
        target_link_libraries(MelodyForge PUBLIC
            "${MELODYFORGE_EXTERNAL_LIBS_PREFIX}/lib/libpng16.a"
            "${MELODYFORGE_EXTERNAL_LIBS_PREFIX}/lib/libjpeg.a"
            "${MELODYFORGE_EXTERNAL_LIBS_PREFIX}/lib/libz.a")
    endif()

    target_link_libraries(MelodyForge
        PRIVATE
            MelodyForgeAssets
            juce::juce_audio_utils
        PUBLIC
            juce::juce_recommended_config_flags
            juce::juce_recommended_lto_flags
            juce::juce_recommended_warning_flags)
endif()

# Functional test of the processor with a simulated host (native builds only).
if(MELODYFORGE_BUILD_PLUGIN AND MELODYFORGE_BUILD_TESTS AND NOT CMAKE_CROSSCOMPILING)
    juce_add_console_app(mf_processor_test PRODUCT_NAME "mf_processor_test")
    target_sources(mf_processor_test PRIVATE tests/processor_test.cpp Source/PluginProcessor.cpp Source/PluginEditor.cpp)
    target_include_directories(mf_processor_test PRIVATE Source ${REPO_ROOT}/src/plugin)
    target_compile_definitions(mf_processor_test PRIVATE
        JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_USE_FLAC=0 JUCE_USE_OGGVORBIS=0 JUCE_DISPLAY_SPLASH_SCREEN=0 JucePlugin_Name="MelodyForge ISLAND27")
    target_link_libraries(mf_processor_test PRIVATE
        MelodyForgeAssets juce::juce_audio_utils juce::juce_recommended_config_flags)
    add_test(NAME mf_processor_test COMMAND mf_processor_test)
endif()
