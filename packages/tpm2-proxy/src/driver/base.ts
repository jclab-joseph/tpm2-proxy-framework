import * as events from 'events';

export interface TpmDriverBase extends events.EventEmitter {
  writeControlRaw(data: Buffer): Promise<void>;
  writeDataRaw(data: Buffer): Promise<void>;
  close(): void;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  on(eventName: 'control', listener: (data: Buffer) => void): this;
  on(eventName: 'data', listener: (data: Buffer) => void): this;
  on(eventName: 'close', listener: (data: Buffer) => void): this;
  emit(eventName: string | symbol, ...args: any[]): boolean;
  emit(eventName: 'control', data: Buffer): boolean;
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
