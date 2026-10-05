import { EventEmitter } from 'node:events';
import type { RoomKeys } from '../../../src/main/roomCrypto';
import type { PeerKey, Transport, TransportStatus } from '../../../src/main/transport';

/** Records what RoomManager sends; tests push packets in with deliver(). */
export class FakeTransport extends EventEmitter implements Transport {
  status: TransportStatus = 'off';
  started: RoomKeys | null = null;
  sent: { to: PeerKey | '*'; packet: Uint8Array }[] = [];

  constructor(readonly kind: 'lan' | 'internet' = 'lan') {
    super();
  }

  start(keys: RoomKeys): void {
    this.started = keys;
    this.setStatus('ok');
  }

  stop(): void {
    this.started = null;
    this.setStatus('off');
  }

  sendTo(peer: PeerKey, packet: Uint8Array): void {
    this.sent.push({ to: peer, packet });
  }

  broadcast(packet: Uint8Array): void {
    this.sent.push({ to: '*', packet });
  }

  deliver(peer: PeerKey, packet: Uint8Array): void {
    this.emit('packet', peer, packet);
  }

  setStatus(s: TransportStatus): void {
    this.status = s;
    this.emit('status', s);
  }
}
