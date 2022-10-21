import * as fs from 'fs';
import {SwtpmProxyDriver} from './driver/swtpm-proxy';
import {SwtpmUpstreamDriver} from './driver/swtpm-upstream';
import {TpmControlPayload, TpmDataPayload} from './driver/base';
import {hexdump} from './driver/utils';
import PcapGenerator, {Packet} from './pcap/pcap-generator';
import {PseudoIPv4Udp} from './pcap/pseudo-udp';

// 0000   45 00 00 34 2b 1b 40 00 40 06 11 a7 7f 00 00 01
// 0010   7f 00 00 01

function hexdump2(title: string, data: Buffer): void {
  const lines = [
    `${title}:`,
    hexdump(data).replace(/^/mg, '    '),
    ''
  ];
  console.log(lines.join('\n'));
}

async function run() {
  const upstream = new SwtpmUpstreamDriver();
  const downstream = new SwtpmProxyDriver();

  const pcapGenerator = new PcapGenerator({
    linkLayerType: 101 // LINKTYPE_RAW
  });
  const pcapFileStream = fs.createWriteStream(`./tpm-capture-${new Date().getTime()}.pcap`);
  pcapGenerator.pipe(pcapFileStream);

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

  await upstream.connect({
    ctrl: 'type=tcp,port=55169',
    data: 'type=tcp,port=56169'
  });
  console.log('upstream connected');
  await downstream.listenAndWait({
    frontendControl: 'unix:path=/tmp/fake.sock,mode=777'
  });
  console.log('downstream connected');

  upstream.on('control', (payload: TpmControlPayload) => {
    downstream.writeControlRaw(payload.raw);
    hexdump2('UPSTREAM: CONTROL', payload.raw);

    pcapGenerator.write({
      timestamp: new Date().getTime(),
      buffer: upstreamControlUdp.generatePacket(payload.raw)
    } as Packet);
  });
  upstream.on('data', (payload: TpmDataPayload) => {
    downstream.writeDataRaw(payload.raw);
    hexdump2('UPSTREAM: DATA', payload.raw);

    pcapGenerator.write({
      timestamp: new Date().getTime(),
      buffer: upstreamDataUdp.generatePacket(payload.raw)
    } as Packet);
  });
  downstream.on('control', (payload: TpmControlPayload) => {
    upstream.writeControlRaw(payload.raw);
    hexdump2('DOWNSTREAM: CONTROL', payload.raw);

    pcapGenerator.write({
      timestamp: new Date().getTime(),
      buffer: downstreamControlUdp.generatePacket(payload.raw)
    } as Packet);
  });
  downstream.on('data', (payload: TpmDataPayload) => {
    upstream.writeDataRaw(payload.raw);
    hexdump2('DOWNSTREAM: DATA', payload.raw);

    pcapGenerator.write({
      timestamp: new Date().getTime(),
      buffer: downstreamDataUdp.generatePacket(payload.raw)
    } as Packet);
  });

  upstream.resume();
  downstream.resume();
}

run();

