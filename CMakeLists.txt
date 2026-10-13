cmake_minimum_required(VERSION 3.22)

project(IslandParametricEQ VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(ISLANDEQ_BUILD_PLUGIN "Build the VST3/AU/Standalone plugin (needs JUCE)" ON)
option(ISLANDEQ_BUILD_TESTS "Build the DSP core unit tests" ON)
option(ISLANDEQ_FETCH_JUCE "Download JUCE if it is not installed" ON)

# ---------------------------------------------------------------------------
# Dependency-free DSP core
# ---------------------------------------------------------------------------
add_library(islandeq_core INTERFACE)
target_include_directories(islandeq_core INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/src)

if(ISLANDEQ_BUILD_TESTS)
    enable_testing()
    add_executable(islandeq_core_tests tests/core_tests.cpp)
    target_link_libraries(islandeq_core_tests PRIVATE islandeq_core)
    if(NOT MSVC)
        target_compile_options(islandeq_core_tests PRIVATE -Wall -Wextra)
    endif()
    add_test(NAME islandeq_core_tests COMMAND islandeq_core_tests -v)
endif()

# ---------------------------------------------------------------------------
# Plugin (JUCE)
# ---------------------------------------------------------------------------
if(ISLANDEQ_BUILD_PLUGIN)
    find_package(JUCE CONFIG QUIET)
    if(NOT JUCE_FOUND)
        if(NOT ISLANDEQ_FETCH_JUCE)
            message(FATAL_ERROR "JUCE not found. Install it or enable ISLANDEQ_FETCH_JUCE.")
        endif()
        include(FetchContent)
        FetchContent_Declare(JUCE
            GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
            GIT_TAG 7.0.12
            GIT_SHALLOW TRUE)
        FetchContent_MakeAvailable(JUCE)
    endif()

    set(ISLANDEQ_FORMATS VST3 Standalone)
    if(APPLE)
        list(APPEND ISLANDEQ_FORMATS AU)
    endif()

    juce_add_plugin(IslandParametricEQ
        COMPANY_NAME "Island27"
        BUNDLE_ID "com.island27.parametriceq"
        PLUGIN_MANUFACTURER_CODE Isl7
        PLUGIN_CODE Iseq
        FORMATS ${ISLANDEQ_FORMATS}
        PRODUCT_NAME "Island Parametric EQ"
        IS_SYNTH FALSE
        NEEDS_MIDI_INPUT FALSE
        NEEDS_MIDI_OUTPUT FALSE
        IS_MIDI_EFFECT FALSE
        EDITOR_WANTS_KEYBOARD_FOCUS FALSE
        VST3_CATEGORIES Fx EQ
        AU_MAIN_TYPE kAudioUnitType_Effect
        ICON_BIG "${CMAKE_CURRENT_SOURCE_DIR}/resources/icon.png"
        COPY_PLUGIN_AFTER_BUILD FALSE)

    juce_add_binary_data(IslandEQAssets
        HEADER_NAME IslandAssets.h
        NAMESPACE IslandAssets
        SOURCES
            resources/logo.png
            resources/banner_bg.jpg
            resources/SpaceGrotesk-Bold.ttf
            resources/IBMPlexSans-Regular.ttf
            resources/IBMPlexSans-SemiBold.ttf)
    set_target_properties(IslandEQAssets PROPERTIES POSITION_INDEPENDENT_CODE ON)

    target_sources(IslandParametricEQ PRIVATE
        src/plugin/PluginProcessor.cpp
        src/plugin/PluginEditor.cpp)

    target_compile_definitions(IslandParametricEQ PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0)

    # Some JUCE distributions (e.g. Debian's) strip the bundled zlib/libpng/libjpeg.
    # For such cross builds, point ISLANDEQ_EXTERNAL_LIBS_PREFIX at a prefix holding
    # static builds of them (see scripts/build-windows-mingw.sh).
    set(ISLANDEQ_EXTERNAL_LIBS_PREFIX "" CACHE PATH "Prefix with static zlib/libpng/libjpeg for JUCE")
    if(ISLANDEQ_EXTERNAL_LIBS_PREFIX)
        target_compile_definitions(IslandParametricEQ PUBLIC
            JUCE_INCLUDE_ZLIB_CODE=0
            JUCE_INCLUDE_PNGLIB_CODE=0
            JUCE_INCLUDE_JPEGLIB_CODE=0
            JUCE_USE_FLAC=0
            JUCE_USE_OGGVORBIS=0)
        target_include_directories(IslandParametricEQ PUBLIC "${ISLANDEQ_EXTERNAL_LIBS_PREFIX}/include")
        target_link_libraries(IslandParametricEQ PUBLIC
            "${ISLANDEQ_EXTERNAL_LIBS_PREFIX}/lib/libpng16.a"
            "${ISLANDEQ_EXTERNAL_LIBS_PREFIX}/lib/libjpeg.a"
            "${ISLANDEQ_EXTERNAL_LIBS_PREFIX}/lib/libz.a")
    endif()

    target_link_libraries(IslandParametricEQ
        PRIVATE
            islandeq_core
            IslandEQAssets
            juce::juce_audio_utils
            juce::juce_dsp
        PUBLIC
            juce::juce_recommended_config_flags
            juce::juce_recommended_lto_flags
            juce::juce_recommended_warning_flags)
endif()
