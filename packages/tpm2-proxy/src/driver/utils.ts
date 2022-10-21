import { sprintf } from 'sprintf';

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
