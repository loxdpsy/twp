# atlas-engine: the offline translation engine of Atlas Translation (see atlas-engine.cpp).
#
# It is built from Bergamot v0.6.0, the translation engine Firefox uses. Firefox builds it from the inference/ folder of
# mozilla/translations at commit eea6e5a80aa4ddd86d9cc35ce9a65b79aa3ab96d (toolkit/components/translations/bergamot-translator
# in Firefox's source records the same commit). Bergamot is not copied into this repository.
#
# The folder is used with a git repository next to it, tools/atlas-engine/translations-source/.git. Marian reads that
# .git for its version header. CI creates it from the commit's source tarball (see engine.yml), with one empty commit,
# and fetches three submodules as tarballs. To build locally, do the same:
#   mkdir -p tools/atlas-engine/translations-source
#   curl -fsSL https://codeload.github.com/mozilla/translations/tar.gz/eea6e5a80aa4ddd86d9cc35ce9a65b79aa3ab96d | tar xz -C /tmp
#   mv /tmp/translations-eea6e5a80aa4ddd86d9cc35ce9a65b79aa3ab96d/inference tools/atlas-engine/translations-source/
#   git init -q tools/atlas-engine/translations-source && git -C tools/atlas-engine/translations-source \
#     -c user.name=ci -c user.email=ci@localhost commit -q --allow-empty -m "mozilla/translations eea6e5a8"
#   (then fetch the submodules at the commits in engine.yml into the paths it lists: ssplit-cpp, sentencepiece, intgemm,
#   onnxjs and its eigen)
#   cmake -S tools/atlas-engine -B build/engine && cmake --build build/engine --config Release
cmake_minimum_required(VERSION 3.16)
project(atlas-engine LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(ATLAS_BERGAMOT_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/translations-source/inference")
if(NOT EXISTS "${ATLAS_BERGAMOT_SOURCE}/CMakeLists.txt")
  message(FATAL_ERROR "Bergamot (the inference folder of mozilla/translations) is missing in tools/atlas-engine/translations-source. See the comment at the top of this file.")
endif()
if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/translations-source/.git")
  message(FATAL_ERROR "tools/atlas-engine/translations-source must be a git checkout of mozilla/translations (marian reads its .git). See the comment at the top of this file.")
endif()

# The CPU build that Firefox uses for these models: no GPU, no MKL, intgemm for the int8 models, no tests.
set(COMPILE_CPU ON CACHE BOOL "" FORCE)
set(COMPILE_CUDA OFF CACHE BOOL "" FORCE)
set(USE_MKL OFF CACHE BOOL "" FORCE)
# intgemm (the int8 products) is x86 only. ARM builds leave it out and read the float32 packs (see pack_config.h).
# Marian turns intgemm off for ARM by itself; this keeps the option consistent with that.
# On ARM, Ruy does the float32 matrix products (marian's ARM branch turns it on by default). x86 keeps it off.
if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(aarch64|arm64|ARM64)$")
  set(USE_INTGEMM OFF CACHE BOOL "" FORCE)
  set(USE_RUY ON CACHE BOOL "" FORCE)
  # The WASM-compatible sources (set below) pick ONNX for float32 products, but marian's float32 Prod only exists for
  # BLAS or Ruy. Ruy is the float32 path marian uses on ARM, so ONNX is turned off here.
  set(USE_ONNX_SGEMM OFF CACHE BOOL "" FORCE)
else()
  set(USE_INTGEMM ON CACHE BOOL "" FORCE)
  set(USE_RUY OFF CACHE BOOL "" FORCE)
endif()
set(USE_FBGEMM OFF CACHE BOOL "" FORCE)
set(USE_SENTENCEPIECE ON CACHE BOOL "" FORCE)
set(USE_DOXYGEN OFF CACHE BOOL "" FORCE)
set(COMPILE_TESTS OFF CACHE BOOL "" FORCE)
set(COMPILE_UNIT_TESTS OFF CACHE BOOL "" FORCE)
set(COMPILE_EXAMPLES OFF CACHE BOOL "" FORCE)
set(COMPILE_SERVER OFF CACHE BOOL "" FORCE)
set(COMPILE_WASM OFF CACHE BOOL "" FORCE)
set(COMPILE_PYTHON OFF CACHE BOOL "" FORCE)
# Use the WASM-compatible marian sources, as Mozilla's WASM build does (Bergamot's docs require this for changes to
# bergamot-translator). Float products then use ONNX sgemm, which needs no BLAS or LAPACK. A native build without this
# setting aborts on its first translation: "Marian must be compiled with a BLAS library" (marian has a BLAS only on
# macOS, through Accelerate). With these sources the faiss path that needs LAPACK is not compiled.
set(USE_WASM_COMPATIBLE_SOURCE ON CACHE BOOL "" FORCE)
# SentencePiece (through ssplit) needs PCRE2. On Linux and macOS, let the build download and compile it, so every runner
# gets the same copy. On Windows the internal build leaves the static library as pcre2-8-static.lib, which the link does
# not find (ssplit expects pcre2-8.lib). There, PCRE2 comes from vcpkg instead: engine.yml installs it and sets
# CMAKE_PREFIX_PATH, and ssplit finds it with find_library.
if(WIN32)
  set(SSPLIT_USE_INTERNAL_PCRE2 OFF CACHE BOOL "" FORCE)
  # The vcpkg PCRE2 is a static library. pcre2.h declares its functions as DLL imports unless PCRE2_STATIC is defined,
  # which gives unresolved __imp_ symbols at link time.
  add_compile_definitions(PCRE2_STATIC)
  # marian and bergamot compile with /MT (the static C runtime) and link Release without MSVCRT. Every target here
  # must use the same runtime, or the link fails (run 45588723062: no C runtime symbols at all, and pcre2 built with /MD).
  # The vcpkg PCRE2 above is the x64-windows-static triplet for the same reason.
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
else()
  set(SSPLIT_USE_INTERNAL_PCRE2 ON CACHE BOOL "" FORCE)
endif()

# CMake 4 no longer accepts "cmake_minimum_required" below 3.5, and SentencePiece (inside marian) declares an older
# minimum. This lets the vendored code configure with CMake 3.5 rules. CI also sets CMAKE_POLICY_VERSION_MINIMUM=3.5 in
# the environment, which the PCRE2 sub-build needs (see engine.yml).
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

# intgemm (inside marian) builds with -Werror. GCC 12 reports a false "maybe-uninitialized" warning inside its own
# AVX-512 headers, which then stops the build. Turn that one warning off for GCC; other warnings stay errors.
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
  add_compile_options(-Wno-maybe-uninitialized)
endif()

# marian also builds with -Werror, so every warning that a newer compiler adds becomes a build error. Turn off the
# warnings that the bundled code trips, one by one. Each is limited to the compiler that reports it.
# GCC 13 (Ubuntu 24.04): spdlog writes template-id constructors (Foo<T>::Foo<...>), which C++20 warns about.
add_compile_options("$<$<COMPILE_LANG_AND_ID:CXX,GNU>:-Wno-template-id-cdtor>")

# Compiler fixes for the bundled dependencies. None of these change the bergamot code; each one is needed by a CI runner.

# faiss (inside marian) uses uint8_t without including <cstdint>. Newer GCC (Ubuntu 24.04) does not include it
# indirectly any more, so every C++ file gets it.
add_compile_options("$<$<COMPILE_LANG_AND_ID:CXX,GNU,Clang,AppleClang>:-include;cstdint>")

if(APPLE)
  # zlib (inside marian) defines fdopen as a macro. The current macOS SDK declares fdopen in stdio.h, and the
  # macro breaks that declaration. Including stdio.h first, before zlib's macro, avoids it.
  add_compile_options("$<$<COMPILE_LANGUAGE:C>:-include;stdio.h>")
  # sentencepiece (inside marian) converts -1 to an enum. Apple clang in Xcode 16.4 treats that as an error.
  add_compile_options("$<$<COMPILE_LANG_AND_ID:CXX,AppleClang,Clang>:-Wno-enum-constexpr-conversion>")
  # Apple clang's -Wunused-but-set-variable and -Wvla-cxx-extension warnings are errors in marian (see the
  # tree loop after add_subdirectory(bergamot)).
endif()

if(MSVC)
  # protobuf-lite (inside sentencepiece) needs std::hash_compare, which current MSVC does not have. See the header.
  add_compile_options("$<$<COMPILE_LANGUAGE:CXX>:/FI${CMAKE_CURRENT_SOURCE_DIR}/compat/msvc_hash_compare.h>")
endif()

# The library (atlas_engine.dll, libatlas_engine.so, libatlas_engine.dylib) is a shared library, and the static
# libraries of bergamot and marian are linked into it, so their code must be position independent.
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
add_subdirectory("${ATLAS_BERGAMOT_SOURCE}" bergamot)

# marian gives each of its own targets -Wall and -Wextra, and those come after the directory options added above.
# So a -Wno- option set at directory level does not reach them: -Wall turns the warning back on. Apple clang reports
# two warnings in marian's code, and -Werror makes them errors (factored_vocab.cpp and shortlist.cpp have
# unused-but-set variables; ExceptionWithCallStack.cpp has variable-length arrays, which C++ does not allow).
# Those options are added to every target in the bergamot tree, after its own options.
function(atlas_add_options_to_tree dir)
  get_property(targets DIRECTORY "${dir}" PROPERTY BUILDSYSTEM_TARGETS)
  foreach(target IN LISTS targets)
    get_target_property(kind ${target} TYPE)
    if(kind MATCHES "^(EXECUTABLE|STATIC_LIBRARY|SHARED_LIBRARY|MODULE_LIBRARY|OBJECT_LIBRARY)$")
      target_compile_options(${target} PRIVATE ${ARGN})
    endif()
  endforeach()
  get_property(subdirs DIRECTORY "${dir}" PROPERTY SUBDIRECTORIES)
  foreach(sub IN LISTS subdirs)
    atlas_add_options_to_tree("${sub}" ${ARGN})
  endforeach()
endfunction()

if(APPLE)
  atlas_add_options_to_tree("${CMAKE_CURRENT_BINARY_DIR}/bergamot" -Wno-unused-but-set-variable -Wno-vla-cxx-extension)
endif()

add_executable(atlas-engine atlas-engine.cpp)
target_link_libraries(atlas-engine PRIVATE bergamot-translator-source marian)

# The same engine as a shared library, with the C interface in include/atlas_engine.h. The helper loads it in its own
# process, so it needs no separate program and no pipes. atlas-engine-check is a test of the library: it loads a pack and
# translates one text (scripts/engine-smoke.mjs runs it).
add_library(atlas-engine-lib SHARED atlas_engine_lib.cpp)
set_target_properties(atlas-engine-lib PROPERTIES OUTPUT_NAME atlas_engine)
target_include_directories(atlas-engine-lib PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_compile_definitions(atlas-engine-lib PRIVATE ATLAS_ENGINE_BUILD)
target_link_libraries(atlas-engine-lib PRIVATE bergamot-translator-source marian)

add_executable(atlas-engine-check atlas-engine-check.c)
target_link_libraries(atlas-engine-check PRIVATE atlas-engine-lib)

# ARM64: marian's SIMD helpers (functional/operators.h, through simd_utils) need ARM, FMA and SSE. Marian sets them only
# for its own directory, so these targets would be compiled without them and the NEON helpers (sin_ps, _mm_mul_ps, ...)
# would be missing. x86 does not use these helpers, so it is unchanged.
if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(aarch64|arm64|ARM64)$")
  # translator-cli is Bergamot's command-line app; the default build compiles it too.
  foreach(target IN ITEMS bergamot-translator-source translator-cli atlas-engine atlas-engine-lib)
    target_compile_definitions(${target} PRIVATE ARM FMA SSE)
  endforeach()
endif()
