import * as util from 'util';
import { sprintf } from 'sprintf';

export class FifoBuffer {
  private _buffer: Buffer = Buffer.alloc(256);
  private _position: number = 0;

  public push(chunk: Buffer): void {
    chunk.copy(this._buffer, this._position);
    this._position += chunk.length;
  }

  public getLength(): number {
    return this._position;
  }

  public read(length: number): Buffer {
    const output = Buffer.alloc(length);
    this._buffer.copy(output, 0, length);
    return output;
  }

  public pop(length: number): Buffer {
    const output = Buffer.alloc(length);
    this._buffer.copy(output, 0, length);
    this._position -= length;
    this._buffer.copyWithin(0, length, this._position);
    return output;
  }
}

export function hexdump(data: Buffer): string {
  let remaining = data.length;
  let position = 0;
  const output: string[] = [];
  while (remaining > 0) {
    const start = position;
    const end = Math.min(start + 16, data.length);
    const chunk = data.subarray(start, end);
    let text = sprintf('%08x: ', start);
    text += [...chunk].map((v) => sprintf('%02x', v)).join(' ');
    remaining -= 16;
    position += 16;
    output.push(text);
  }
  return output.join('\n');
}

export interface SocketParam {
  type: 'tcp' | 'unix';
  addr: string; // address or path
  port: number;
}

export function parseKeyValue(input: string): {key: string, value: string} {
  const pos = input.indexOf('=');
  if (pos < 0) {
    return {
      key: input,
      value: ''
    };
  } else {
    return {
      key: input.substring(0, pos),
      value: input.substring(pos + 1)
    };
  }
}

export function parseSocketParam(input: string): SocketParam {
  const PREFIX_TCP = 'tcp:';
  const PREFIX_UNIX = 'unix:';

  const params: SocketParam = {} as any;

  if (input.startsWith(PREFIX_TCP)) {
    params.type = 'tcp';
    params.addr = '127.0.0.1';
    params.port = 0;

    const options = input.substring(PREFIX_TCP.length).split(',')
      .map(v => parseKeyValue(v));
    options.forEach((option) => {
      if (option.key === 'addr') {
        params.addr = option.value;
      } else if (option.key === 'port') {
        params.port = parseInt(option.value);
      }
    });
  } else if (input.startsWith(PREFIX_UNIX)) {
    params.type = 'unix';

    const options = input.substring(PREFIX_UNIX.length).split(',')
      .map(v => parseKeyValue(v));
    options.forEach((option) => {
      if (option.key === 'path') {
        params.addr = option.value;
      }
    });
  } else {
    throw new Error('unknown');
  }

  return params;
}
