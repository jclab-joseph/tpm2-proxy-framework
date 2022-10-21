import * as events from 'events';
import * as net from 'net';
import {TpmUpstream} from './base';
import {parseKeyValue, SocketParam} from './utils';

function parseSwtpmAddr(input: string): SocketParam {
  const options = input.split(',')
    .map(v => parseKeyValue(v));
  const output: SocketParam = {} as any;
  options
    .forEach((option) => {
      if (option.key === 'type') {
        if (option.value === 'tcp') {
          output.type = 'tcp';
        } else if (option.value === 'unixio') {
          output.type = 'unix';
        }
      } else if (option.key === 'path' || option.key === 'addr') {
        output.addr = option.value;
      } else if (option.key === 'port') {
        output.port = parseInt(option.value);
      }
    });
  if (output.type === 'tcp' && !output.addr) {
    output.addr = '127.0.0.1';
  }
  return output;
}

export interface SwtpmConnectParams {
  ctrl: string; // type=tcp,addr=127.0.0.1,port=2322
  data: string; // type=unixio,path=...
}

function connectToSocket(socketParam: SocketParam): net.Socket {
  if (socketParam.type === 'tcp') {
    return net.connect(socketParam.port, socketParam.addr);
  } else {
    return net.connect(socketParam.addr);
  }
}

interface ConnectState {
  ctrl: boolean;
  data: boolean;
  rejected: boolean;
  resolved: boolean;
}

export class SwtpmUpstreamDriver extends events.EventEmitter implements TpmUpstream {
  private _ctrlSocket!: net.Socket;
  private _dataSocket!: net.Socket;

  private _closed: boolean = false;

  connect(param: SwtpmConnectParams): Promise<void> {
    const ctrlAddr = parseSwtpmAddr(param.ctrl);
    const dataAddr = parseSwtpmAddr(param.data);
    const state: ConnectState = {
      ctrl: false,
      data: false,
      rejected: false,
      resolved: false
    };
    return new Promise<void>((resolve, reject) => {
      const onError = (err: any) => {
        if (!state.rejected && !state.resolved) {
          state.rejected = true;
          reject(err);
        }
        if (state.resolved) {

        }
      };
      const onConnect = () => {
        if (!state.resolved && state.ctrl && state.data) {
          state.resolved = true;
          resolve();
        }
      }

      this._ctrlSocket = connectToSocket(ctrlAddr);
      this._ctrlSocket.once('error', onError);
      this._ctrlSocket.once('ready', () => {
        state.ctrl = true;
        this._ctrlSocket.once('close', this.onSocketClosed);
        this._ctrlSocket.pause();
        onConnect();
      });
      this._ctrlSocket.on('data', (data) => this.onControlReceived(data));

      this._dataSocket = connectToSocket(dataAddr);
      this._dataSocket.once('error', onError);
      this._dataSocket.once('ready', () => {
        state.data = true;
        this._ctrlSocket.once('close', this.onSocketClosed);
        this._dataSocket.pause();
        onConnect();
      });
      this._dataSocket.on('data', (data) => this.onDataReceived(data));
    });
  }

  resume() {
    this._ctrlSocket.resume();
    this._dataSocket.resume();
  }

  writeControlRaw(data: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._ctrlSocket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  writeDataRaw(data: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._dataSocket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  close(): void {
    if (this._ctrlSocket && !this._ctrlSocket.destroyed) {
      this._ctrlSocket.end();
      this._ctrlSocket = undefined;
    }
    if (this._dataSocket && !this._dataSocket.destroyed) {
      this._dataSocket.end();
      this._dataSocket = undefined;
    }
  }

  private onControlReceived(data: Buffer): void {
    this.emit('control', data);
  }

  private onDataReceived(data: Buffer): void {
    this.emit('data', data);
  }

  private onSocketClosed(): void {
    if (!this._closed) {
      this._closed = true;
      this.emit('close');
    }
  }
}