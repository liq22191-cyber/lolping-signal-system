import { createSocket, type Socket } from 'node:dgram';
import { EventEmitter } from 'node:events';
import { networkInterfaces } from 'node:os';
import { DEFAULT_FLOOD_LIMITS, FloodGuard } from './floodGuard';
import { MAX_PACKET, type RoomKeys } from './roomCrypto';
import type { PeerKey, Transport, TransportStatus } from './transport';

export const LAN_PORT = 47474;
const INTERFACES_MS = 5000;
/** Longest a closing socket waits for queued packets (a bye) to go out. */
const DRAIN_MS = 250;

/** A socket plus its sends still in flight: closing it earlier would drop them. */
interface Sock {
  socket: Socket;
  pending: number;
  drained: (() => void) | null;
}

export interface LanOptions {
  port?: number;
  bindAddress?: string;
  /** Off in tests: loopback carries no broadcast, and tests shouldn't spray the real network. */
  broadcast?: boolean;
  /** Addresses that get every broadcast as unicast too. */
  seeds?: { host: string; port: number }[];
  /** Packets per second accepted from one IP before decryption is even tried. */
  floodPerSecond?: number;
  /** Packets per second accepted from all IPs together. */
  floodTotalPerSecond?: number;
}

/** Directed broadcast address of every IPv4 interface that is up: Windows sends 255.255.255.255 out of one only. */
function broadcastAddresses(): string[] {
  const out = new Set<string>(['255.255.255.255']);
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const ip = i.address.split('.').map(Number);
      const mask = i.netmask.split('.').map(Number);
      out.add(ip.map((b, n) => (b & mask[n]) | (~mask[n] & 255)).join('.'));
    }
  }
  return [...out];
}

/**
 * Room packets over UDP on the local network: presence is broadcast, everything else goes straight to the
 * address a peer's packets came from. No connections, so a lost packet or a network change heals itself.
 */
export class LanTransport extends EventEmitter implements Transport {
  readonly kind = 'lan';
  status: TransportStatus = 'off';
  private sock: Sock | null = null;
  /** Resolves once the previous socket has released the port. */
  private closing: Promise<void> = Promise.resolve();
  private running = false;
  private targets: string[] = [];
  private refresh: NodeJS.Timeout | null = null;
  private readonly flood: FloodGuard;
  private readonly port: number;

  constructor(private readonly opts: LanOptions = {}) {
    super();
    this.port = opts.port ?? LAN_PORT;
    this.flood = new FloodGuard(Date.now, {
      ...DEFAULT_FLOOD_LIMITS,
      perIp: opts.floodPerSecond ?? DEFAULT_FLOOD_LIMITS.perIp,
      total: opts.floodTotalPerSecond ?? DEFAULT_FLOOD_LIMITS.total,
    });
  }

  start(_keys: RoomKeys): void {
    if (this.running) return;
    this.running = true;
    this.readInterfaces();
    this.refresh = setInterval(() => this.readInterfaces(), INTERFACES_MS);
    this.open();
  }

  stop(): void {
    this.running = false;
    if (this.refresh) clearInterval(this.refresh);
    this.refresh = null;
    this.close();
    this.setStatus('off');
  }

  /** Resolves once every socket this transport closed has released the port (and sent what was queued). */
  whenClosed(): Promise<void> {
    return this.closing;
  }

  /** After sleep or a network change: a fresh socket on the same port. */
  rebind(): void {
    if (!this.running) return;
    this.close();
    this.readInterfaces();
    this.open();
  }

  sendTo(peer: PeerKey, packet: Uint8Array): void {
    const m = /^lan:(.+):(\d+)$/.exec(peer);
    if (m) this.send(packet, Number(m[2]), m[1]);
  }

  broadcast(packet: Uint8Array): void {
    if (this.opts.broadcast !== false) for (const host of this.targets) this.send(packet, this.port, host);
    for (const s of this.opts.seeds ?? []) this.send(packet, s.port, s.host);
  }

  private send(packet: Uint8Array, port: number, host: string): void {
    const sock = this.sock;
    if (this.status !== 'ok' || !sock) return;
    sock.pending++;
    // Errors (unreachable network, interface gone) arrive in the callback; a lost packet is fine.
    sock.socket.send(packet, port, host, () => {
      if (--sock.pending === 0) sock.drained?.();
    });
  }

  private open(): void {
    this.setStatus('starting');
    const socket = createSocket({ type: 'udp4' });
    const sock: Sock = { socket, pending: 0, drained: null };
    this.sock = sock;
    socket.on('message', (msg, rinfo) => {
      if (msg.length > MAX_PACKET) return;
      if (!this.flood.allow(rinfo.address)) return;
      this.emit('packet', `lan:${rinfo.address}:${rinfo.port}`, msg);
    });
    socket.on('error', () => {
      if (this.sock !== sock) return;
      this.close();
      this.setStatus('unavailable');
    });
    void this.closing.then(() => {
      if (this.sock !== sock) return;
      socket.bind(this.port, this.opts.bindAddress ?? '0.0.0.0', () => {
        if (this.sock !== sock) return;
        if (this.opts.broadcast !== false) socket.setBroadcast(true);
        this.setStatus('ok');
      });
    });
  }

  /** Closes the current socket once its queued packets are out, so a bye sent just before still arrives. */
  private close(): void {
    const sock = this.sock;
    this.sock = null;
    if (!sock) return;
    const previous = this.closing;
    const closed = new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          sock.socket.close(() => resolve());
        } catch {
          resolve(); // already closed after an error
        }
      };
      const timer = setTimeout(finish, DRAIN_MS);
      if (sock.pending === 0) finish();
      else sock.drained = finish;
    });
    // Chained: two quick rebinds must not let a new socket bind while an older one still holds the port.
    this.closing = Promise.all([previous, closed]).then(() => undefined);
  }

  private readInterfaces(): void {
    this.targets = broadcastAddresses();
  }

  private setStatus(s: TransportStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.emit('status', s);
  }
}
