#!/usr/bin/env bash
# Cross-compiles the Windows build (Standalone .exe + VST3) from Ubuntu 24.04
# with MinGW-w64, using the distro's JUCE 7 package.
#
# Debian/Ubuntu's JUCE strips the bundled zlib/libpng/libjpeg, so static
# Windows builds of them are made from the Ubuntu source packages first.
#
# Usage: scripts/build-windows-mingw.sh [output-dir]   (default: dist/windows)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/dist/windows}"
WORK="$ROOT/build-win-deps"
TC="$ROOT/cmake/mingw-w64-x86_64.cmake"
PREFIX="$WORK/prefix"

need_pkgs=(juce-modules-source juce-tools mingw-w64 g++-mingw-w64-x86-64-posix libz-mingw-w64-dev cmake ninja-build dpkg-dev)
missing=()
for p in "${need_pkgs[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
if ((${#missing[@]})); then
    echo "Installing: ${missing[*]}"
    sudo apt-get install -y "${missing[@]}"
fi

mkdir -p "$WORK/src" "$PREFIX/lib" "$PREFIX/include"

# --- third-party image libs (static, Windows) ---------------------------------
if [[ ! -f "$PREFIX/lib/libjpeg.a" || ! -f "$PREFIX/lib/libpng16.a" ]]; then
    pushd "$WORK/src" >/dev/null
    if ! ls libjpeg-turbo_*.orig.tar.gz >/dev/null 2>&1; then
        echo "Fetching Ubuntu source packages (needs deb-src enabled)"
        apt-get source --download-only libpng1.6 libjpeg-turbo
    fi
    tar xzf libjpeg-turbo_*.orig.tar.gz
    tar xzf libpng1.6_*.orig.tar.gz
    JPEG_SRC="$(ls -d libjpeg-turbo-*/ | head -1)"
    PNG_SRC="$(ls -d libpng-*/ | head -1)"
    popd >/dev/null

    cmake -S "$WORK/src/$JPEG_SRC" -B "$WORK/bjpeg" -G Ninja -DCMAKE_TOOLCHAIN_FILE="$TC" \
        -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX" \
        -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_SIMD=OFF -DWITH_TURBOJPEG=OFF -Wno-dev
    cmake --build "$WORK/bjpeg" --target install

    cmake -S "$WORK/src/$PNG_SRC" -B "$WORK/bpng" -G Ninja -DCMAKE_TOOLCHAIN_FILE="$TC" \
        -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX" \
        -DPNG_SHARED=OFF -DPNG_STATIC=ON -DPNG_TESTS=OFF -DPNG_TOOLS=OFF \
        -DZLIB_ROOT=/usr/x86_64-w64-mingw32 -Wno-dev
    cmake --build "$WORK/bpng" --target install

    # JUCE's JPEG loader includes these internal headers
    for h in jpegint.h jinclude.h jdct.h jsimd.h jsimddct.h jchuff.h jdhuff.h jmemsys.h jpegcomp.h; do
        [[ -f "$WORK/src/$JPEG_SRC/$h" ]] && cp "$WORK/src/$JPEG_SRC/$h" "$PREFIX/include/"
    done
    # JUCE includes jpeglib.h inside its own namespace after <windows.h>; make the
    # Windows "boolean" typedef unconditional so it exists there (same type as the lib).
    python3 - "$PREFIX/include/jconfig.h" <<'EOF'
import sys
p = sys.argv[1]
s = open(p).read()
old = "#ifndef __RPCNDR_H__            /* don't conflict if rpcndr.h already read */\ntypedef unsigned char boolean;\n#endif"
if old in s:
    s = s.replace(old, "typedef unsigned char boolean; /* unconditional: JUCE includes jpeglib in a namespace */")
    open(p, "w").write(s)
EOF
fi
cp /usr/x86_64-w64-mingw32/lib/libz.a "$PREFIX/lib/"
cp /usr/x86_64-w64-mingw32/include/zlib.h /usr/x86_64-w64-mingw32/include/zconf.h "$PREFIX/include/"

# JUCE's VST3 post-build step calls the Windows-only "attrib"; make it a no-op here.
FAKEBIN="$WORK/fakebin"
mkdir -p "$FAKEBIN"
printf '#!/bin/sh\nexit 0\n' > "$FAKEBIN/attrib"
chmod +x "$FAKEBIN/attrib"
export PATH="$FAKEBIN:$PATH"

# --- plugin -------------------------------------------------------------------
JUCE_CONFIG="$(dpkg -L juce-modules-source juce-tools 2>/dev/null | grep -m1 '/JUCEConfig.cmake$')"
cmake -S "$ROOT" -B "$ROOT/build-win" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_TOOLCHAIN_FILE="$TC" -DISLANDEQ_FETCH_JUCE=OFF -DISLANDEQ_BUILD_TESTS=OFF \
    -DJUCE_DIR="$(dirname "$JUCE_CONFIG")" \
    -DISLANDEQ_EXTERNAL_LIBS_PREFIX="$PREFIX"
cmake --build "$ROOT/build-win" --target IslandParametricEQ_Standalone IslandParametricEQ_VST3

ART="$ROOT/build-win/IslandParametricEQ_artefacts/Release"
mkdir -p "$OUT"
x86_64-w64-mingw32-strip -o "$OUT/Island Parametric EQ.exe" "$ART/Standalone/Island Parametric EQ.exe"
rm -rf "$OUT/Island Parametric EQ.vst3"
cp -r "$ART/VST3/Island Parametric EQ.vst3" "$OUT/"
x86_64-w64-mingw32-strip "$OUT/Island Parametric EQ.vst3/Contents/x86_64-win/Island Parametric EQ.vst3"
echo "Windows build ready in $OUT"
