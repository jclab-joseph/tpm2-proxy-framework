import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as events from 'events';
import * as childProcess from 'child_process';

import {
  TpmDownstream
} from './base';
import {
  SocketParam,
  parseSocketParam
} from './utils';

export interface SwtpmProxyListenParam {
  proxyExec?: string[] | undefined;

  /**
   * unix:path=...,mode=777
   */
  frontendControl: string;

  backendControl?: string | undefined;
  backendData?: string | undefined;
}

interface ListenState {
  beControlServer: boolean;
  beDataServer: boolean;
  rejected: boolean;
}

export class SwtpmProxyDriver extends events.EventEmitter implements TpmDownstream {
  private _beControlServer!: net.Server;
  private _beDataServer!: net.Server;
  private _beControlSocket!: net.Socket;
  private _beDataSocket!: net.Socket;
  private _process!: childProcess.ChildProcess;

  private _closed: boolean = false;

  constructor() {
    super();
  }

  listenAndWait(param: SwtpmProxyListenParam): Promise<void> {
    let backendControl!: SocketParam
    let backendData!: SocketParam;

    const state: ListenState = {
      beControlServer: false,
      beDataServer: false,
      rejected: false
    };

    try {
      backendControl = parseSocketParam(param.backendControl || 'tcp:addr=127.0.0.1');
      backendData = parseSocketParam(param.backendData || 'tcp:addr=127.0.0.1');
    } catch (e) {
      return Promise.reject(e);
    }

    return new Promise<void>((resolve, reject) => {
      const startProcess = () => {
        const proxyExec = param.proxyExec ? [...param.proxyExec] : [path.resolve(__dirname, '../../bin/swtpm_proxy')];
        if (backendControl.type === 'unix') {
          const addr = this._beControlServer.address() as string;
          proxyExec.push('--backend-control');
          proxyExec.push(`unix:path=${addr}`);
        } else if (backendControl.type === 'tcp') {
          const addr = this._beControlServer.address() as net.AddressInfo;
          proxyExec.push('--backend-control');
          proxyExec.push(`tcp:addr=${addr.address},port=${addr.port}`);
        }
        if (backendData.type === 'unix') {
          const addr = this._beDataServer.address() as string;
          proxyExec.push('--backend-data');
          proxyExec.push(`unix:path=${addr}`);
        } else if (backendData.type === 'tcp') {
          const addr = this._beDataServer.address() as net.AddressInfo;
          proxyExec.push('--backend-data');
          proxyExec.push(`tcp:addr=${addr.address},port=${addr.port}`);
        }
        proxyExec.push('--frontend-control');
        proxyExec.push(param.frontendControl);

        const process = childProcess.spawn(proxyExec.shift(), proxyExec, {
          stdio: 'inherit'
        });
        this._process = process;
      };
      const onError = (err: any) => {
        if (!state.rejected) {
          state.rejected = true;
          reject(err);
        }
      };
      const onListen = (server: net.Server) => {
        if (state.rejected) {
          server.close();
          return ;
        }
        if (state.beControlServer && state.beDataServer) {
          startProcess();
        }
      };
      const onConnect = () => {
        if (this._beControlSocket && this._beDataSocket) {
          console.error('all connected');
          resolve();
        }
      };
      const listenSocket = (server: net.Server, param: SocketParam, onListen: () => void): net.Server => {
        server.once('error', onError);
        if (param.type === 'tcp') {
          server.listen(param.port, param.addr, onListen);
        } else {
          if (fs.existsSync(param.addr)) {
            fs.unlinkSync(param.addr);
          }
          server.listen(param.addr, onListen);
        }
        return server;
      };

      this._beControlServer = net.createServer();
      this._beControlServer.once('connection', (connection) => {
        connection.pause();
        this._beControlSocket = connection;
        connection.on('close', () => this.onSocketClosed());
        connection.on('data', (data) => this.onControlReceived(data));
        onConnect();
      });

      this._beDataServer = net.createServer();
      this._beDataServer.once('connection', (connection) => {
        connection.pause();
        this._beDataSocket = connection;
        connection.on('close', () => this.onSocketClosed());
        connection.on('data', (data) => this.onDataReceived(data));
        onConnect();
      });

      listenSocket(this._beControlServer, backendControl, () => {
        state.beControlServer = true;
        onListen(this._beControlServer);
      });
      listenSocket(this._beDataServer, backendData, () => {
        state.beDataServer = true;
        onListen(this._beDataServer);
      });
    });
  }

  resume() {
    this._beControlSocket.resume();
    this._beDataSocket.resume();
  }

  writeControlRaw(data: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._beControlSocket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  writeDataRaw(data: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._beDataSocket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  close(): void {
    if (this._closed) {
      return ;
    }

    this._closed = true;
    if (this._beControlServer) {
      this._beControlServer.close();
    }
    this._beControlServer = undefined;
    if (this._beDataServer) {
      this._beDataServer.close();
    }
    this._beDataServer = undefined;
    if (this._beControlSocket && !this._beControlSocket.destroyed) {
      this._beControlSocket.end();
    }
    this._beControlSocket = undefined;
    if (this._beDataSocket && !this._beDataSocket.destroyed) {
      this._beDataSocket.end();
    }
    this._beDataSocket = undefined;
    if (this._process && !this._process.killed) {
      this._process.kill(0);
    }
    this._process = undefined;
  }

  private onControlReceived(data: Buffer): void {
    this.emit('control', data);
  }

  private onDataReceived(data: Buffer): void {
    this.emit('data', data);
  }

  private onSocketClosed(): void {
    if (!this._closed) {
      this.close();
      this.emit('close');
    }
  }
}
