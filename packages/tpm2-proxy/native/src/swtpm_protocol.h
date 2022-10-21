#ifndef _SWTPM_PROTOCOL_H_
#define _SWTPM_PROTOCOL_H_

#include <sys/socket.h>

#include "swtpm_ioctl.h"

struct swtpm_ctrl_input {
  uint32_t cmd;
  /* ptm_hdata is the largest buffer to receive */
  uint8_t body[sizeof(ptm_hdata)];
};

ssize_t swtpm_ctrlchannel_recv_cmd(int fd, struct msghdr *msg);

#endif /* _SWTPM_PROTOCOL_H_ */
