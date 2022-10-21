cmake_minimum_required(VERSION 3.18)
project(swtpm-proxy)

set(CMAKE_CXX_STANDARD 14)

add_executable(swtpm_proxy
        src/swtpm_ioctl.h
        src/swtpm_protocol.h
        src/swtpm_protocol.cc
        src/utils.h
        src/utils.cc
        src/main.cc
        )
