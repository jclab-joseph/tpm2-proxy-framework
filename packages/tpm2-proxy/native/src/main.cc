#include <arpa/inet.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/epoll.h>
#include <sys/errno.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

#include "swtpm_ioctl.h"
#include "swtpm_protocol.h"
#include "utils.h"

typedef struct {
  int mode;
  struct sockaddr_storage addr;
  int addr_len;
} socket_addr_param_t;

typedef struct {
  socket_addr_param_t be_control_socket_param;
  socket_addr_param_t be_data_socket_param;
  socket_addr_param_t fe_control_socket_param;
  int be_control_fd;
  int be_data_fd;
  int fe_control_server_fd;
  int fe_control_conn_fd;
  int fe_data_fd;
  int epoll_fd;
} app_ctx_t;

static int parseArgs(app_ctx_t *ctx, int argc, char* argv[]);
static int parseSocketAddr(socket_addr_param_t* output, const char* params);
static int appMain(app_ctx_t *ctx);

int main(int argc, char* argv[]) {
  int rc;
  app_ctx_t ctx = {0};

  rc = parseArgs(&ctx, argc, argv);
  if (rc) {
    return rc;
  }

  ctx.be_control_fd = socket(ctx.be_control_socket_param.addr.ss_family, SOCK_STREAM, 0);
  if (ctx.be_control_fd < 0) return errno;
  ctx.be_data_fd = socket(ctx.be_data_socket_param.addr.ss_family, SOCK_STREAM, 0);
  if (ctx.be_data_fd < 0) return errno;
  ctx.fe_control_server_fd = socket(ctx.fe_control_socket_param.addr.ss_family, SOCK_STREAM, 0);
  if (ctx.fe_control_server_fd < 0) return errno;

  rc = appMain(&ctx);
  
  return rc;
}

static int parseArgs(app_ctx_t *ctx, int argc, char* argv[])
{
  int rc = 0;

  for (int i=0; i<argc && rc == 0; i++) {
    if (strcmp(argv[i], "--backend-control") == 0) {
      i++;
      if (i >= argc) {
        rc = 1;
        break;
      }
      rc = parseSocketAddr(&ctx->be_control_socket_param, argv[i]);
    } else if (strcmp(argv[i], "--backend-data") == 0) {
      i++;
      if (i >= argc) {
        rc = 1;
        break;
      }
      rc = parseSocketAddr(&ctx->be_data_socket_param, argv[i]);
    } else if (strcmp(argv[i], "--frontend-control") == 0) {
      i++;
      if (i >= argc) {
        rc = 1;
        break;
      }
      rc = parseSocketAddr(&ctx->fe_control_socket_param, argv[i]);
    }
  }

  return rc;
}

static int parseSocketAddr(socket_addr_param_t* output, const char* params) {
  char* context;
  char* token;
  char buffer[320];

  struct sockaddr_un *addr_un = (struct sockaddr_un *)&output->addr;
  struct sockaddr_in *addr_in = (struct sockaddr_in *)&output->addr;

  memset(output, 0, sizeof(*output));
  output->mode = 0660;

  strncpy(buffer, params, sizeof(buffer));

  if (strstr(params, "tcp:")) {
    context = buffer + 4;
    output->addr.ss_family = AF_INET;
    output->addr_len = sizeof(*addr_in);
    addr_in->sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  } else if (strstr(params, "unix:")) {
    context = buffer + 5;
    output->addr.ss_family = AF_UNIX;
    output->addr_len = sizeof(*addr_un);
  } else {
    return 1;
  }

  do {
    token = strtok_r(context, ",", &context);
    if (!token) break;

    if (strstr(token, "path=")) {
      if (output->addr.ss_family != AF_UNIX) {
        return 1;
      }

      token += 5;
      strncpy(addr_un->sun_path, token, sizeof(addr_un->sun_path));
    } else if (strstr(token, "mode=")) {
      int mode;

      if (output->addr.ss_family != AF_UNIX) {
        return 1;
      }

      token += 5;
      mode = atoi(token);
      int o = ((mode / 100) % 10);
      int g = ((mode / 10) % 10);
      int u = ((mode) % 10);
      mode = o * 8 * 8;
      mode += g * 8;
      mode += u;
      output->mode = mode;
    } else if (strstr(token, "addr=")) {
      if (output->addr.ss_family != AF_INET) {
        return 1;
      }

      token += 5;
      inet_pton(addr_in->sin_family, token, &addr_in->sin_addr);
    } else if (strstr(token, "port=")) {
      int port;

      if (output->addr.ss_family != AF_INET) {
        return 1;
      }

      token += 5;
      port = atoi(token);
      addr_in->sin_port = htons(port);
    }
  } while (token);

  return 0;
}

static int forward_by_read(int out_fd, int in_fd) {
  char buffer[4096];
  int recvd = read_eintr(in_fd, buffer, sizeof(buffer));
  if (recvd > 0) {
    int written = write_full(out_fd, buffer, recvd);
    if (written > 0) {
      return written;
    }
  }
  return recvd;
}

static int forward_data(int out_fd, const void* data, size_t len) {
  int written = write_full(out_fd, data, len);
  return written;
}

/**
 * handleFrontControlChannel
 *
 * @param ctx
 * @param fd
 * @return
 *    0 : success
 *   -1 : connection closed
 *   otherwise : error
 */
static int handleFrontControlChannel(app_ctx_t *ctx, int fd) {
  struct swtpm_ctrl_input input = {0};

  struct iovec iov = {
      .iov_base = &input,
      .iov_len = sizeof(input),
  };
  char control[CMSG_SPACE(sizeof(int))];
  struct msghdr msg = {
      .msg_iov = &iov,
      .msg_iovlen = 1,
      .msg_control = control,
      .msg_controllen = sizeof(control),
  };

  int recvd;
  int rc = 0;
  struct cmsghdr *cmsg = NULL;
  const int *data_fd = NULL;
  int cmd;

  recvd = swtpm_ctrlchannel_recv_cmd(fd, &msg);
  if (recvd <= 0) {
    rc = errno;
    fprintf(stderr, "control channel error: %d\n", rc);
    return -1;
  }

  cmd = be32toh(input.cmd);

  fprintf(stderr, "control command: 0x%08x\n", cmd);

  if (cmd == CMD_SET_DATAFD) {
    cmsg = CMSG_FIRSTHDR(&msg);
    if (!cmsg || cmsg->cmsg_len < CMSG_LEN(sizeof(int)) ||
        cmsg->cmsg_level != SOL_SOCKET ||
        cmsg->cmsg_type != SCM_RIGHTS ||
        !(data_fd = (int *)CMSG_DATA(cmsg)) ||
        *data_fd < 0) {
      fprintf(stderr, "no valid data socket in message; cmsg = %p\n", cmsg);

      return -1;
    } else {
      struct epoll_event tmp_event;
      char resp[4] = {0,0,0,0};
      ssize_t written;

      fprintf(stderr, "CMD_SET_DATAFD: fd=%d\n", *data_fd);

      ctx->fe_data_fd = *data_fd;
      tmp_event.events = EPOLLIN | EPOLLET;
      tmp_event.data.fd = *data_fd;
      rc = epoll_ctl(ctx->epoll_fd, EPOLL_CTL_ADD, *data_fd, &tmp_event);
      if (rc) {
        return -1;
      }

      written = write_full(fd, resp, 4);
      if (written <= 0) {
        return -1;
      }
    }
  } else {
    int written = forward_data(ctx->be_control_fd, iov.iov_base, recvd);
    if (written > 0) {
      fprintf(stderr, "forward control FE to BE: %d\n", written);
    }
  }

  return recvd;
}

#define EPOLL_EVENTS_SIZE 16
static int appMain(app_ctx_t *ctx) {
  int rc;
  int epoll_fd;
  struct epoll_event events[EPOLL_EVENTS_SIZE];
  struct epoll_event tmp_event;
  int processed;
  int running = 1;

  epoll_fd = epoll_create(16);
  if (epoll_fd < 0) {
    return errno;
  }

  ctx->epoll_fd = epoll_fd;

  // Listen front-end control channel
  fprintf(stderr, "Listen front-end socket\n");

  if (ctx->fe_control_socket_param.addr.ss_family == AF_UNIX) {
    const char *path = ((struct sockaddr_un*)&ctx->fe_control_socket_param.addr)->sun_path;
    unlink(path);
    fprintf(stderr, "Listen from unix:%s\n", path);
    rc = bind(ctx->fe_control_server_fd, (const struct sockaddr *) &ctx->fe_control_socket_param.addr, ctx->fe_control_socket_param.addr_len);
    if (rc == 0) {
      chmod(path, ctx->fe_control_socket_param.mode);
    }
  } else {
    rc = bind(ctx->fe_control_server_fd, (const struct sockaddr *) &ctx->fe_control_socket_param.addr, ctx->fe_control_socket_param.addr_len);
  }
  if (rc) return errno;
  rc = listen(ctx->fe_control_server_fd, 1);
  if (rc) return errno;

  tmp_event.data.fd = ctx->fe_control_server_fd;
  tmp_event.events = EPOLLIN | EPOLLET | EPOLLONESHOT;
  rc = epoll_ctl(epoll_fd, EPOLL_CTL_ADD, ctx->fe_control_server_fd, &tmp_event);
  if (rc) return errno;

  // Connect backend channels
  fprintf(stderr, "Connect to back-end control channel\n");

  rc = connect(ctx->be_control_fd, (const struct sockaddr *) &ctx->be_control_socket_param.addr, ctx->be_control_socket_param.addr_len);
  if (rc) {
    fprintf(stderr, "failed: error=%d\n", errno);
    return errno;
  }

  tmp_event.data.fd = ctx->be_control_fd;
  tmp_event.events = EPOLLIN | EPOLLET;
  rc = epoll_ctl(epoll_fd, EPOLL_CTL_ADD, ctx->be_control_fd, &tmp_event);
  if (rc) return errno;

  fprintf(stderr, "Connect to back-end data channel\n");
  rc = connect(ctx->be_data_fd, (const struct sockaddr *) &ctx->be_data_socket_param.addr, ctx->be_data_socket_param.addr_len);
  if (rc) {
    fprintf(stderr, "failed: error=%d\n", errno);
    return errno;
  }

  tmp_event.data.fd = ctx->be_data_fd;
  tmp_event.events = EPOLLIN | EPOLLET;
  rc = epoll_ctl(epoll_fd, EPOLL_CTL_ADD, ctx->be_data_fd, &tmp_event);
  if (rc) return errno;

  ctx->fe_control_conn_fd = -1;
  ctx->fe_data_fd = -1;

  fprintf(stderr, "Start eventloop\n");

  while (running) {
    int event_count = epoll_wait(epoll_fd, events, EPOLL_EVENTS_SIZE, 1000);
    for (int i = 0; i < event_count && running; i++) {
      struct epoll_event* event = &events[i];
      int fd = event->data.fd;
      if (fd == ctx->fe_control_server_fd) {
        struct sockaddr_storage client_addr = {0};
        socklen_t client_addr_len = sizeof(client_addr);
        int client_fd;

        fprintf(stderr, "EPOLL HANDLE: FE_CONTROL_SERVER\n");

        client_fd = accept(ctx->fe_control_server_fd, (struct sockaddr *) &client_addr, &client_addr_len);
        fprintf(stderr, "CONNECTED FRONTEND CONTROL CHANNEL: %d\n", client_fd);

        ctx->fe_control_conn_fd = client_fd;
        tmp_event.data.fd = client_fd;
        tmp_event.events = EPOLLIN | EPOLLET;
        rc = epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &tmp_event);
        if (rc < 0) {
          fprintf(stderr, "epoll_ctl error: %d\n", errno);
          running = 0;
          break;
        }
      } else if (fd == ctx->fe_control_conn_fd) {
        fprintf(stderr, "EPOLL HANDLE: FE_CONTROL\n");

        processed = handleFrontControlChannel(ctx, ctx->fe_control_conn_fd);
        if (processed <= 0) {
          running = 0;
          fprintf(stderr, "control channel disconnected 1\n");
          break;
        }
      } else if (fd == ctx->fe_data_fd) {
        fprintf(stderr, "EPOLL HANDLE: FE_DATA\n");

        processed = forward_by_read(ctx->be_data_fd, fd);
        if (processed <= 0) {
          running = 0;
          fprintf(stderr, "data channel disconnected 1\n");
          break;
        } else {
          fprintf(stderr, "forward data FE to BE: %d\n", processed);
        }
      } else if (fd == ctx->be_control_fd) {
        fprintf(stderr, "EPOLL HANDLE: BE_CONTROL\n");

        processed = forward_by_read(ctx->fe_control_conn_fd, fd);
        if (processed <= 0) {
          running = 0;
          fprintf(stderr, "control channel disconnected 2\n");
          break;
        } else {
          fprintf(stderr, "forward control BE to FE: %d\n", processed);
        }
      } else if (fd == ctx->be_data_fd) {
        fprintf(stderr, "EPOLL HANDLE: BE_DATA\n");

        processed = forward_by_read(ctx->fe_data_fd, fd);
        if (processed <= 0) {
          running = 0;
          fprintf(stderr, "data channel disconnected 2\n");
          break;
        } else {
          fprintf(stderr, "forward data BE to FE: %d\n", processed);
        }
      } else {
        fprintf(stderr, "UNKNOWN FD: %d\n", fd);
      }
    }
  }

  if (ctx->fe_data_fd > 0) {
    shutdown(ctx->fe_data_fd, SHUT_RDWR);
  }
  if (ctx->fe_control_conn_fd > 0) {
    shutdown(ctx->fe_control_conn_fd, SHUT_RDWR);
  }
  if (ctx->be_control_fd > 0) {
    shutdown(ctx->be_control_fd, SHUT_RDWR);
  }
  if (ctx->be_data_fd > 0) {
    shutdown(ctx->be_data_fd, SHUT_RDWR);
  }

  fprintf(stderr, "Exiting...\n");

  close(epoll_fd);

  return 0;
}
