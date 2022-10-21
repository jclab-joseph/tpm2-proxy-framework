import {TpmDownstream, TpmUpstream} from './driver';
import {Packet as PcapPacket, PseudoIPv4Udp} from './pcap';
import {serializeTpm2Packet, Packet as Tpm2Packet, ProtocolReader} from './tpm2/tpm2-tcti';
import PcapGenerator from './pcap/pcap-generator';
import fs from 'fs';

export interface WritePcapOptions {
  path: string;
}

type DataHandler = (packet: Tpm2Packet) => Promise<void>;

export interface Tpm2ProxyOptions {
  upstream: TpmUpstream;
  downstream: TpmDownstream;
  onUpstreamData: DataHandler;
  onDownstreamData: DataHandler;
  writePcap?: WritePcapOptions | null | undefined | false;
}

const upstreamControlUdp = new PseudoIPv4Udp({
  srcPort: 2321,
  srcIp: '127.0.0.1',
  destPort: 10001,
  destIp: '127.0.0.1',
  identification: 0x0001
});
const upstreamDataUdp = new PseudoIPv4Udp({
  srcPort: 2322,
  srcIp: '127.0.0.1',
  destPort: 10002,
  destIp: '127.0.0.1',
  identification: 0x0002
});
const downstreamControlUdp = new PseudoIPv4Udp({
  srcPort: 10001,
  srcIp: '127.0.0.1',
  destPort: 2321,
  destIp: '127.0.0.1',
  identification: 0x0001
});
const downstreamDataUdp = new PseudoIPv4Udp({
  srcPort: 10002,
  srcIp: '127.0.0.1',
  destPort: 2322,
  destIp: '127.0.0.1',
  identification: 0x0002
});

export class Tpm2Proxy {
  private readonly upstream: TpmUpstream;
  private readonly downstream: TpmDownstream;

  private readonly upstreamReader: ProtocolReader = new ProtocolReader();
  private readonly downstreamReader: ProtocolReader = new ProtocolReader();

  private readonly onUpstreamData: DataHandler;
  private readonly onDownstreamData: DataHandler;

  private pcapGenerator: PcapGenerator | null = null;

  constructor(options: Tpm2ProxyOptions) {
    this.upstream = options.upstream;
    this.downstream = options.downstream;
    this.onUpstreamData = options.onUpstreamData;
    this.onDownstreamData = options.onDownstreamData;

    if (options.writePcap) {
      this.pcapGenerator = new PcapGenerator({
        linkLayerType: 101 // LINKTYPE_RAW
      });
      const pcapFileStream = fs.createWriteStream(options.writePcap.path);
      this.pcapGenerator.pipe(pcapFileStream);
    }

    this.upstream.on('control', (data) => {
      if (this.pcapGenerator) {
        this.pcapGenerator.write({
          timestamp: new Date().getTime(),
          buffer: upstreamControlUdp.generatePacket(data)
        } as PcapPacket);
      }
      this.downstream.writeControlRaw(data);
    });
    this.upstream.on('data', (data) => {
      if (this.pcapGenerator) {
        this.pcapGenerator.write({
          timestamp: new Date().getTime(),
          buffer: upstreamDataUdp.generatePacket(data)
        } as PcapPacket);
      }
      this.upstreamReader.push(data);
      this.handleUpstreamData();
    });
    this.downstream.on('control', (data) => {
      if (this.pcapGenerator) {
        this.pcapGenerator.write({
          timestamp: new Date().getTime(),
          buffer: downstreamControlUdp.generatePacket(data)
        } as PcapPacket);
      }
      this.upstream.writeControlRaw(data);
    });
    this.downstream.on('data', (data) => {
      if (this.pcapGenerator) {
        this.pcapGenerator.write({
          timestamp: new Date().getTime(),
          buffer: downstreamDataUdp.generatePacket(data)
        } as PcapPacket);
      }
      this.downstreamReader.push(data);
      this.handleDownstreamData();
    });
  }

  public writeToUpstream(packet: Tpm2Packet): Promise<void> {
    return this.upstream.writeDataRaw(serializeTpm2Packet(packet));
  }

  public writeToDownstream(packet: Tpm2Packet): Promise<void> {
    return this.downstream.writeDataRaw(serializeTpm2Packet(packet));
  }

  private handleUpstreamData() {
    const packet = this.upstreamReader.parse();
    if (!packet) return ;
    this.onUpstreamData(packet)
      .then(() => {
        setImmediate(() => this.handleUpstreamData());
      });
  }

  private handleDownstreamData() {
    const packet = this.downstreamReader.parse();
    if (!packet) return ;
    this.onDownstreamData(packet)
      .then(() => {
        setImmediate(() => this.handleDownstreamData());
      });
  }
}
