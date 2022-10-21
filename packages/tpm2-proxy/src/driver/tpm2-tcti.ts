import {
  TPM2_ST_ENUM
} from './tpm2';
import {
  UINT32
} from './common-types';
import {FifoBuffer} from './utils';

export interface Tpm2Header {
  tag: TPM2_ST_ENUM;
  size: UINT32;
  code: UINT32
}
export const Tpm2Header_SIZE = 10;

export function parseTpm2Header(chunk: Buffer): Tpm2Header {
  const header: Tpm2Header = {
    tag: chunk[0] << 8 | chunk[1],
    size: chunk[2] << 24 | chunk[3] << 16 | chunk[4] << 8 | chunk[5],
    code: chunk[6] << 24 | chunk[7] << 16 | chunk[8] << 8 | chunk[9]
  };
  return header;
}

export class Tpm2Tcit {
}
