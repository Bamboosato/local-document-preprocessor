#!/bin/sh
set -eu
cd /audit/anydoc
export CARGO_HOME=/audit/cargo-home
export CARGO_TARGET_DIR=/audit/target
printf '{"image":"rust@sha256:1a939748a7cbab172de91a014e3804a97af1394a8c844faa67fce9401c4e40fb","cargo":"%s","rustc":"%s"}\n' "$(cargo --version)" "$(rustc --version)" > /audit/toolchain.json
# Metadata and tree do not compile packages or execute upstream build.rs.
cargo tree --locked -p anydoc-wasm --target wasm32-unknown-unknown --edges normal,build --prefix none --format '{p}|{f}' > /audit/target-tree.txt
cargo metadata --locked --format-version 1 --filter-platform wasm32-unknown-unknown > /audit/cargo-metadata.json
printf 'Cargo graph resolved; upstream packages were not compiled.\n'
