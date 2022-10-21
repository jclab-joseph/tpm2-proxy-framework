import * as events from 'events';

export interface TpmDriverBase extends events.EventEmitter {
  writeControlRaw(data: Buffer): Promise<void>;
  writeDataRaw(data: Buffer): Promise<void>;
  close(): void;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  on(eventName: 'data', listener: (data: Buffer) => void): this;
  on(eventName: 'close', listener: (data: Buffer) => void): this;
  emit(eventName: string | symbol, ...args: any[]): boolean;
  emit(eventName: 'data', data: Buffer): boolean;
  emit(eventName: 'close'): boolean;
}

export interface TpmUpstream extends TpmDriverBase {
  connect(param: any): Promise<void>;
  resume(): void;
}

export interface TpmDownstream extends TpmDriverBase {
  listenAndWait(param: any): Promise<void>;
  resume(): void;
}

export interface TpmControlPayload {
  raw: Buffer;
}

export interface TpmDataPayload {
  raw: Buffer;
}

/*

static void
tcti_libtpms_init_context_data(TSS2_TCTI_COMMON_CONTEXT *tcti_common)
{
    TSS2_TCTI_MAGIC (tcti_common) = TCTI_LIBTPMS_MAGIC;
    TSS2_TCTI_VERSION (tcti_common) = TCTI_VERSION;
    TSS2_TCTI_TRANSMIT (tcti_common) = tcti_libtpms_transmit;
    TSS2_TCTI_RECEIVE (tcti_common) = tcti_libtpms_receive;
    TSS2_TCTI_FINALIZE (tcti_common) = tcti_libtpms_finalize;
    TSS2_TCTI_CANCEL (tcti_common) = tcti_libtpms_cancel;
    TSS2_TCTI_GET_POLL_HANDLES (tcti_common) = tcti_libtpms_get_poll_handles;
    TSS2_TCTI_SET_LOCALITY (tcti_common) = tcti_libtpms_set_locality;
    TSS2_TCTI_MAKE_STICKY (tcti_common) = tcti_make_sticky_not_implemented;
    tcti_common->state = TCTI_STATE_TRANSMIT;
    memset(&tcti_common->header, 0, sizeof(tcti_common->header));
 */