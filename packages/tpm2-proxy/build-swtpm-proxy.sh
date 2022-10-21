#!/bin/bash

BUILD_DIR=${PWD}/.build/swtpm-proxy
SRC_DIR=$PWD/native
BIN_DIR=$PWD/bin

mkdir -p ${BUILD_DIR} ${BIN_DIR}

function do_build() {
  set -e
  cd ${BUILD_DIR}
  cmake ${SRC_DIR}
  cmake --build .
  cp swtpm_proxy ${BIN_DIR}/swtpm_proxy
}

(do_build) || true

