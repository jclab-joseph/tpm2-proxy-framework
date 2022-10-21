#include <errno.h>
#include <poll.h>
#include <stddef.h>
#include <stdint.h>
#include <time.h>
#include <unistd.h>

#include "swtpm_protocol.h"
#include "utils.h"

/* timespec_diff: calculate difference between two timespecs
 *
 * @end: end time
 * @start: start time; must be earlier than @end
 * @diff: result
 *
 * This function will return a negative tv_sec in result, if
 * @end is earlier than @start, the time difference otherwise.
 */
static void timespec_diff(struct timespec *end,
                          struct timespec *start,
                          struct timespec *diff)
{
  diff->tv_nsec = end->tv_nsec - start->tv_nsec;
  diff->tv_sec = end->tv_sec - start->tv_sec;
  if (diff->tv_nsec < 0) {
    diff->tv_nsec += 1E9;
    diff->tv_sec -= 1;
  }
}

/*
* swtpm_ctrlchannel_recv_cmd: Receive a command on the control channel
*
* @fd: file descriptor for control channel
* @msg: prepared msghdr struct for receiveing data with single
*       msg_iov.
*
* This function returns 0 or a negative number if an error receiving
* the command occurred, including a timeout. In case of success,
* the nunber of bytes received is returned.
*/
ssize_t swtpm_ctrlchannel_recv_cmd(int fd, struct msghdr *msg)
{
 ssize_t n;
 size_t recvd = 0;
 size_t needed = offsetof(struct swtpm_ctrl_input, body);
 struct swtpm_ctrl_input *input = (struct swtpm_ctrl_input *)msg->msg_iov[0].iov_base;
 struct pollfd pollfd =  {
     .fd = fd,
     .events = POLLIN,
 };
 struct timespec deadline, now, timeout;
 int to;
 size_t buffer_len = msg->msg_iov[0].iov_len;
 /* Read-write */
 ptm_init *init_p;
 ptm_reset_est *pre;
 ptm_hdata *phd;
 ptm_getstate *pgs;
 ptm_setstate *pss;
 ptm_loc *pl;
 const void *msg_iov = msg->msg_iov;

 clock_gettime(CLOCK_REALTIME, &deadline);

 /* maximum allowed time is 500ms to receive everything */
 deadline.tv_nsec += 500 * 1E6;
 if (deadline.tv_nsec >= 1E9) {
   deadline.tv_nsec -= 1E9;
   deadline.tv_sec += 1;
 }

 while (recvd < buffer_len) {
   if (!recvd) {
     n = recvmsg(fd, msg, 0);
     /* address a coverity issue by validating msg */
     if (msg_iov != msg->msg_iov ||
         msg->msg_iov[0].iov_base != input ||
         msg->msg_iov[0].iov_len > buffer_len)
       return -1;
   } else {
     n = read_eintr(fd, ((char *) msg->msg_iov[0].iov_base) + recvd, buffer_len - recvd);
   }
   if (n <= 0)
     return n;
   recvd += n;
   /* we need to at least see the cmd */
   if (recvd < offsetof(struct swtpm_ctrl_input, body))
     goto wait_chunk;

   switch (be32toh(input->cmd)) {
     case CMD_GET_CAPABILITY:
       break;
     case CMD_INIT:
       needed = offsetof(struct swtpm_ctrl_input, body) +
                sizeof(init_p->u.req);
       break;
     case CMD_SHUTDOWN:
       break;
     case CMD_GET_TPMESTABLISHED:
       break;
     case CMD_SET_LOCALITY:
       needed = offsetof(struct swtpm_ctrl_input, body) +
                sizeof(pl->u.req);
       break;
     case CMD_HASH_START:
       break;
     case CMD_HASH_DATA:
       needed = offsetof(struct swtpm_ctrl_input, body) +
                offsetof(struct ptm_hdata, u.req.data);
       if (recvd >= needed) {
         phd = (struct ptm_hdata *)&input->body;
         needed += be32toh(phd->u.req.length);
       }
       break;
     case CMD_HASH_END:
       break;
     case CMD_CANCEL_TPM_CMD:
       break;
     case CMD_STORE_VOLATILE:
       break;
     case CMD_RESET_TPMESTABLISHED:
       needed = offsetof(struct swtpm_ctrl_input, body) +
                sizeof(pre->u.req);
       break;
     case CMD_GET_STATEBLOB:
       needed = offsetof(struct swtpm_ctrl_input, body) +
                sizeof(pgs->u.req);
       break;
     case CMD_SET_STATEBLOB:
       needed = offsetof(struct swtpm_ctrl_input, body) +
                offsetof(struct ptm_setstate, u.req.data);
       if (recvd >= needed) {
         pss = (struct ptm_setstate *)&input->body;
         needed += be32toh(pss->u.req.length);
       }
       break;
     case CMD_STOP:
       break;
     case CMD_GET_CONFIG:
       break;
     case CMD_SET_BUFFERSIZE:
       break;
   }

   if (recvd >= needed)
     break;

 wait_chunk:
   clock_gettime(CLOCK_REALTIME, &now);
   timespec_diff(&deadline, &now, &timeout);

   if (timeout.tv_sec < 0)
     break;
   to = timeout.tv_sec * 1000 + timeout.tv_nsec / 1E6;

   /* wait for the next chunk */
   while (true) {
     n = poll(&pollfd, 1, to);
     if (n < 0 && errno == EINTR)
       continue;
     if (n <= 0)
       return n;
     break;
   }
   /* we should have data now */
 }
 return recvd;
}
