import * as streams from 'stream';

function isMicroseconds (ts: number): boolean {
  return ts % 1 !== 0;
}

function makeLessThanAMillion (i: number): number {
  while (i > 1000000) {
    i = Math.floor(i / 10);
  }
  return i;
}

export interface PcapGeneratorOptions {
  stream: streams.TransformOptions;
  majorVersion: number;
  minorVersion: number;
  gmtOffset: number;
  timestampAccuracy: number;
  snapshotLength: number;
  linkLayerType: number;
}

export interface Packet {
  timestamp: number;
  buffer: Buffer;
}

export interface PcapGeneratorInterface {
  write(chunk: Packet, cb?: (error: Error | null | undefined) => void): boolean;
}

export default class PcapGenerator extends streams.Transform implements PcapGeneratorInterface {
  public readonly options: PcapGeneratorOptions;

  constructor(options?: Partial<PcapGeneratorOptions>) {
    super(Object.assign({
      writableObjectMode: true,
      autoDestroy: true
    } as streams.TransformOptions, options?.stream || {}));
    this.options = Object.assign({
      majorVersion: 2,
      minorVersion: 4,
      gmtOffset: 0,
      timestampAccuracy: 0,
      snapshotLength: 65536,
      linkLayerType: 101
    } as PcapGeneratorOptions, options || {});

    const globalHeader = Buffer.alloc(24)
    globalHeader.writeUInt32BE(2712847316, 0) // 4
    globalHeader.writeUInt16BE(this.options.majorVersion, 4) // 2
    globalHeader.writeUInt16BE(this.options.minorVersion, 6) // 2
    globalHeader.writeInt32BE(this.options.gmtOffset, 8) // 4
    globalHeader.writeUInt32BE(this.options.timestampAccuracy, 12) // 4
    globalHeader.writeUInt32BE(this.options.snapshotLength, 16) // 4
    globalHeader.writeUInt32BE(this.options.linkLayerType, 20) // 4
    this.push(globalHeader);
  }

  _transform(packet: Packet, encoding: BufferEncoding, callback: streams.TransformCallback) {
    const packetHeader = Buffer.alloc(16)
    const isTimestampMicroPrecision = isMicroseconds(packet.timestamp)
    const [seconds, microseconds] = isTimestampMicroPrecision
      ? String(packet.timestamp).split('.').map(str => Number(str))
      : [Math.floor(packet.timestamp / 1000), Math.floor(((packet.timestamp / 1000) % 1) * 1000000)]
    packetHeader.writeUInt32BE(seconds, 0) // 4
    packetHeader.writeUInt32BE(makeLessThanAMillion(microseconds), 4) // 4 - if in microsecond precision then remove excess of 1,000,000 (see documentation)
    packetHeader.writeUInt32BE(packet.buffer.length, 8) // 4
    packetHeader.writeUInt32BE(packet.buffer.length, 12) // 4

    this.push(packetHeader);
    this.push(packet.buffer);
    callback();
  }
}
