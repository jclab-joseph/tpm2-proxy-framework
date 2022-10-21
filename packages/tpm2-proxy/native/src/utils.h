#ifndef _UTILS_H_
#define _UTILS_H_

#include <stdint.h>
#include <sys/uio.h>


ssize_t write_full(int fd, const void *buffer, size_t buflen);
ssize_t writev_full(int fd, const struct iovec *iov, int iovcnt);
ssize_t read_eintr(int fd, void *buffer, size_t buflen);

#endif /* _UTILS_H_ */
