#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#include "utils.h"

/*
 * write_full: Write all bytes of a buffer into the file descriptor
 *             and handle partial writes on the way.
 *
 * @fd: file descriptor to write to
 * @buffer: buffer
 * @buflen: length of buffer
 *
 * Returns -1 in case not all bytes could be transferred, number of
 * bytes written otherwise (must be equal to buflen).
 */
ssize_t write_full(int fd, const void *buffer, size_t buflen)
{
  size_t written = 0;
  ssize_t n;

  while (written < buflen) {
    n = write(fd, buffer, buflen - written);
    if (n == 0)
      return -1;
    if (n < 0) {
      if (errno == EINTR)
        continue;
      return -1;
    }
    written += n;
    buffer = (const void*) ((const char*)buffer + n);
  }
  return written;
}

/*
 * writev_full: Write all bytes of an iovec into the file descriptor
 *              and handle partial writes on the way.
 * @fd: file descriptor to write to
 * @iov: pointer to iov
 * @iovcnt: length of iov array
 *
 * Returns -1 in case not all bytes could be transferred, number of
 * bytes written otherwise (must be equal to buflen).
 */
ssize_t writev_full(int fd, const struct iovec *iov, int iovcnt)
{
  int i;
  size_t off;
  unsigned char *buf;
  ssize_t n;
  size_t bytecount = 0;
  size_t numbufs = 0;
  size_t lastidx = -1;

  for (i = 0; i < iovcnt; i++) {
    if (iov[i].iov_len) {
      bytecount += iov[i].iov_len;
      numbufs++;
      lastidx = i;
    }
  }

  if (numbufs == 1)
    return write_full(fd, iov[lastidx].iov_base, iov[lastidx].iov_len);

  buf = (unsigned char *)malloc(bytecount);
  if (!buf) {
    errno = ENOMEM;
    return -1;
  }

  off = 0;
  for (i = 0; i < iovcnt; i++) {
    if (!iov[i].iov_len)
      continue;
    memcpy(&buf[off], iov[i].iov_base, iov[i].iov_len);
    off += iov[i].iov_len;
  }

  n = write_full(fd, buf, off);

  free(buf);

  return n;
}

/*
 * read_einter: Read bytes from a file descriptor into a buffer
 *              and handle EINTR. Perform one read().
 *
 * @fd: file descriptor to read from
 * @buffer: buffer
 * @buflen: length of buffer
 *
 * Returns -1 in case an error occurred, number of bytes read otherwise.
 */
ssize_t read_eintr(int fd, void *buffer, size_t buflen)
{
  ssize_t n;

  while (true) {
    n = read(fd, buffer, buflen);
    if (n < 0) {
      if (errno == EINTR)
        continue;
      return -1;
    }
    return n;
  }
}
