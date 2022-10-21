import {
  TPM2_ST_ENUM
} from './tpm2';
import {FifoBuffer} from './utils';

export type UINT32 = number;

export interface Header {
  tag: TPM2_ST_ENUM;
  size: UINT32;
  code: UINT32
}
export const Header_SIZE = 10;

export interface Packet extends Header {
  data: Buffer;
  raw?: Buffer;
}

export class ProtocolReader {
  private readonly receiveBuffer: FifoBuffer = new FifoBuffer();

  public push(chunk: Buffer): void {
    this.receiveBuffer.push(chunk);
  }

  public parse(): Packet | null {
    const available = this.receiveBuffer.getLength();

    if (available < Header_SIZE)
      return null;

    const headerRaw = this.receiveBuffer.peek(Header_SIZE);
    const header: Header = {
      tag: headerRaw.readUint16BE(0),
      size: headerRaw.readUint32BE(2),
      code: headerRaw.readUint32BE(6)
    };
    if (available < header.size)
      return null;

    const datagram = this.receiveBuffer.pop(header.size);
    return {
      ...header,
      data: datagram.subarray(Header_SIZE),
      raw: datagram
    } as Packet;
  }
}

export function serializeTpm2Packet(packet: Packet): Buffer {
  console.log('packet: ', packet);
  const buffer = Buffer.alloc(Header_SIZE + packet.data.length);
  buffer.writeUint16BE(packet.tag, 0);
  buffer.writeUint32BE(buffer.length, 2);
  buffer.writeUint32BE(packet.code, 6);
  packet.data.copy(buffer, Header_SIZE);
  return buffer;
}