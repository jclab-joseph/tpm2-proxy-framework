export interface PseudoIPv4TcpOptions {
  srcIp: string;
  srcPort: number;
  destIp: string;
  destPort: number;
  identification: number;
}

function computeChecksum(buffer: Buffer, offset: number, size: number): number {
  let sum = 0;
  for (let i=0; i < size; i += 2) {
    const b = buffer.readUint16LE(offset + i);
    sum += b;
  }
  sum = ((sum >> 16) & 0xffff) + (sum & 0xffff);
  return sum ^ 0xffff;
}

function ipToNumber(ip: string): number[] {
  const token = ip.split('.');
  return token.map(v => parseInt(v));
}

export class PseudoIPv4Udp {
  private _srcIp: number[];
  private _destIp: number[];

  constructor(public readonly options: PseudoIPv4TcpOptions) {
    this._srcIp = ipToNumber(options.srcIp);
    this._destIp = ipToNumber(options.destIp);
  }

  public generatePacket(data: Buffer): Buffer {
    const dataLength = (data.length % 2) ? data.length + 1 : data.length;
    const output = Buffer.alloc(20 + 8 + dataLength);
    output[0] = 0x45; // IPv4, header 20 bytes
    output[1] = 0x00;

    // total length
    output.writeUint16BE(output.length, 2);

    // identification
    output.writeUint16BE(this.options.identification, 4);

    output[6] = 0x40; // Don't fragement
    output[7] = 0x00;

    output[8] = 0x40; // TTL
    output[9] = 17;
    // tcp(6), udp(17)

    // checksum
    output[10] = 0x00;
    output[11] = 0x00;

    // dest
    output[12] = this._destIp[0];
    output[13] = this._destIp[3];
    output[14] = this._destIp[2];
    output[15] = this._destIp[1];

    output[16] = this._srcIp[0];
    output[17] = this._srcIp[1];
    output[18] = this._srcIp[2];
    output[19] = this._srcIp[3];

    const ipCheckSum = computeChecksum(output, 0, 20);
    output.writeUint16BE(ipCheckSum, 10);

    output.writeUint16BE(this.options.srcPort, 20);
    output.writeUint16BE(this.options.destPort, 22);
    output.writeUint16BE(data.length + 8, 24);

    if (data.length > 0) {
      data.copy(output, 28);
    }

    const udpCheckSum = computeChecksum(output, 20, 8 + dataLength);
    output.writeUint16BE(udpCheckSum, 26);

    return output;
  }
}
