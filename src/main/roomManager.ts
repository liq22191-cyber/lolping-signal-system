import { EventEmitter } from 'node:events';
import type { PingId } from '../shared/pings';
import type { JoinResult, MemberPath, RoomMember, RoomStateCore } from '../shared/room';
import { formatRoomCode, makeRoomCode, parseRoomCode } from '../shared/roomCode';
import {
  decodeMessage, encodeMessage, PROTOCOL_VERSION, type MemberStatus, type PresenceMsg, type RoomMessage,
} from '../shared/roomProtocol';
import { RateLimiter } from './rateLimiter';
import { ReplayGuard } from './replayGuard';
import { open, seal, type RoomKeys } from './roomCrypto';
import type { PeerKey, Transport, TransportStatus } from './transport';

export const MAX_MEMBERS = 8;
const SETTLE_MS = 3000;
const TICK_MS = 1000;
/** How often presence is re-announced on each transport. */
const PRESENCE_MS: Record<Transport['kind'], number> = { lan: 2000, internet: 10_000 };
/** How long a path counts as alive after the last packet over it. */
const ALIVE_MS: Record<Transport['kind'], number> = { lan: 6000, internet: 15_000 };
const DROP_MS = 15_000;
const UNREACHABLE_MS = 20_000;
const LONELY_MS = 20_000;
const STALE_STRIKES = 3;
/** A housekeeping tick this late means the computer slept: nobody was heard because we weren't listening. */
const SLEEP_GAP_MS = 5000;
/** How long the clock warning stays up after the last stale presence. */
const SKEW_HINT_MS = 30_000;

export interface RemotePing {
  displayId: number;
  x: number;
  y: number;
  id: PingId;
  tag: { name: string; color: number };
}

export type RoomToast =
  | { kind: 'joined' | 'left' | 'disconnected'; name: string }
  | { kind: 'joinedRoom'; code: string }
  | { kind: 'full' };

export interface RoomDeps {
  transports: Transport[];
  now(): number;
  randomBytes(n: number): Uint8Array;
  deriveKeys(canonical: string): Promise<RoomKeys>;
  appVersion: string;
  /** Read on every use, so settings changes apply at once. `limit`: incoming pings per second per member, 0 = unlimited. */
  profile(): { name: string; color: number; limit: number };
  /** Display number → where a ping for it lands here, or null to drop it. The hook share mode will replace. */
  resolveTarget(d: number): { displayId: number; width: number; height: number } | null;
}

interface Member {
  peer: string;
  name: string;
  color: number;
  status: MemberStatus;
  needsUpdate: boolean;
  muted: boolean;
  firstSeen: number;
  /** Per transport kind: the address it was last heard from, and when. */
  paths: Partial<Record<Transport['kind'], { key: PeerKey; seenAt: number }>>;
}

const toHex = (b: Uint8Array): string => [...b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * The room: who is in it, what we send, and what we let through. Talks to the network only through transports,
 * which carry sealed packets. Events: 'state' (RoomStateCore), 'remotePing' (RemotePing), 'toast' (RoomToast),
 * 'saveCode' (canonical code | null: what "rejoin last room" should remember).
 */
export class RoomManager extends EventEmitter {
  /** Our peer ID: random per join, since a peer that said bye stays "gone" to the others for their whole session. */
  self: string;
  private phase: RoomStateCore['phase'] = 'idle';
  private code: string | null = null;
  private keys: RoomKeys | null = null;
  /** Bumped on every join and leave, so a join still deriving keys can tell it was cancelled. */
  private session = 0;
  private seq = 0;
  private members = new Map<string, Member>();
  private answered = new Set<PeerKey>();
  /** Per peer ID: stale presences seen, and when the last one came. Never turns into a member. */
  private staleStrikes = new Map<string, { count: number; at: number }>();
  private guard: ReplayGuard;
  private readonly limiter: RateLimiter;
  private paused = false;
  private roomMuted = false;
  private aloneSince: number | null = null;
  private lastPresence: Partial<Record<Transport['kind'], number>> = {};
  private ticker: NodeJS.Timeout | null = null;
  private lastTick = 0;
  /** When we last woke from sleep: members count as heard then, so they get a fresh grace period. */
  private wokeAt = 0;
  private settle: NodeJS.Timeout | null = null;
  private lastState = '';

  constructor(private readonly deps: RoomDeps) {
    super();
    this.self = toHex(deps.randomBytes(8));
    this.guard = new ReplayGuard(deps.now);
    this.limiter = new RateLimiter(deps.now);
    for (const t of deps.transports) {
      t.on('packet', (peer: PeerKey, packet: Uint8Array) => this.onPacket(t, peer, packet));
      t.on('peerGone', (peer: PeerKey) => this.onPeerGone(t, peer));
      t.on('status', (s: TransportStatus) => {
        if (s === 'ok') this.announce(t); // a fresh socket: tell everyone now rather than at the next 2 s round
        this.emitState();
      });
    }
  }

  async create(): Promise<void> {
    await this.start(makeRoomCode(this.deps.randomBytes(9)));
  }

  async join(text: string): Promise<JoinResult> {
    const parsed = parseRoomCode(text);
    if (!parsed.ok) return parsed;
    return (await this.start(parsed.code)) ? { ok: true } : { ok: false, error: 'failed' };
  }

  /** Leaves the room and forgets it, so it isn't rejoined on the next launch. */
  leave(): void {
    if (this.phase === 'idle') return;
    this.stop();
    this.emit('saveCode', null);
  }

  /** Says bye on the way out, but keeps the code for "rejoin last room". */
  quit(): void {
    if (this.phase !== 'idle') this.stop();
  }

  sendPing(ping: PingId, shared: { d: number; x: number; y: number }): void {
    if (this.phase === 'idle' || !this.keys || this.paused) return;
    const packet = this.seal({ t: 'ping', ping, ...shared });
    for (const m of this.members.values()) {
      const route = this.route(m);
      if (route) route.transport.sendTo(route.key, packet);
    }
  }

  setStatusFlags(f: { paused: boolean; roomMuted: boolean }): void {
    if (f.paused === this.paused && f.roomMuted === this.roomMuted) return;
    this.paused = f.paused;
    this.roomMuted = f.roomMuted;
    this.announce();
    this.emitState();
  }

  muteMember(peer: string, on: boolean): void {
    const m = this.members.get(peer);
    if (!m) return;
    m.muted = on;
    this.emitState();
  }

  /** Name or colour changed: tell everyone now. */
  profileChanged(): void {
    this.announce();
    this.emitState();
  }

  state(): RoomStateCore {
    const now = this.deps.now();
    const status = (kind: Transport['kind']): TransportStatus =>
      this.phase === 'idle' ? 'off' : (this.deps.transports.find((t) => t.kind === kind)?.status ?? 'off');
    const p = this.deps.profile();
    const members: RoomMember[] = this.phase === 'idle' ? [] : [
      { peer: this.self, name: p.name, color: p.color, path: 'lan', status: this.status(), needsUpdate: false, muted: false, self: true },
      ...[...this.members.values()].map((m) => ({
        peer: m.peer, name: m.name, color: m.color, path: this.path(m, now), status: m.status,
        needsUpdate: m.needsUpdate, muted: m.muted, self: false,
      })),
    ];
    return {
      phase: this.phase,
      code: this.code ? formatRoomCode(this.code) : null,
      members,
      lan: status('lan'),
      internet: status('internet'),
      lonely: this.aloneSince !== null && now - this.aloneSince >= LONELY_MS,
      clockSkew: [...this.staleStrikes.values()].some((s) => s.count >= STALE_STRIKES && now - s.at < SKEW_HINT_MS),
    };
  }

  /** False when the keys couldn't be derived: the room is back to idle. */
  private async start(code: string): Promise<boolean> {
    if (this.phase !== 'idle') this.leave();
    const session = ++this.session;
    this.self = toHex(this.deps.randomBytes(8));
    this.seq = 0;
    this.phase = 'joining';
    this.code = code;
    this.guard = new ReplayGuard(this.deps.now);
    this.aloneSince = this.deps.now();
    this.emitState();
    let keys: RoomKeys;
    try {
      keys = await this.deps.deriveKeys(code);
    } catch {
      if (session === this.session) this.stop();
      return false;
    }
    if (session !== this.session) return true; // left while deriving
    this.keys = keys;
    for (const t of this.deps.transports) t.start(keys);
    this.announce();
    this.lastTick = this.deps.now();
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.settle = setTimeout(() => this.settled(), SETTLE_MS);
    this.emitState();
    return true;
  }

  private settled(): void {
    this.settle = null;
    if (this.members.size >= MAX_MEMBERS) {
      this.stop();
      this.emit('toast', { kind: 'full' } satisfies RoomToast);
      return;
    }
    this.phase = 'active';
    this.emit('saveCode', this.code);
    this.emit('toast', { kind: 'joinedRoom', code: formatRoomCode(this.code!) } satisfies RoomToast);
    this.emitState();
  }

  private stop(): void {
    this.session++;
    if (this.keys) {
      const bye = this.seal({ t: 'bye' });
      for (const t of this.deps.transports) this.spread(t, bye);
      for (const t of this.deps.transports) t.stop();
    }
    if (this.ticker) clearInterval(this.ticker);
    if (this.settle) clearTimeout(this.settle);
    this.ticker = this.settle = null;
    this.phase = 'idle';
    this.code = this.keys = null;
    this.members.clear();
    this.answered.clear();
    this.staleStrikes.clear();
    this.lastPresence = {};
    this.aloneSince = null;
    this.emitState();
  }

  private tick(): void {
    const now = this.deps.now();
    if (now - this.lastTick > SLEEP_GAP_MS) this.wokeAt = now;
    this.lastTick = now;
    for (const [peer, s] of this.staleStrikes) if (now - s.at >= SKEW_HINT_MS) this.staleStrikes.delete(peer);
    for (const m of [...this.members.values()]) {
      const heard = Math.max(...Object.values(m.paths).map((p) => p.seenAt), m.firstSeen, this.wokeAt);
      if (now - heard >= DROP_MS) this.remove(m, 'disconnected');
    }
    for (const t of this.deps.transports) {
      if (now - (this.lastPresence[t.kind] ?? 0) >= PRESENCE_MS[t.kind]) this.announce(t);
    }
    this.emitState();
  }

  private onPacket(t: Transport, key: PeerKey, packet: Uint8Array): void {
    if (!this.keys) return;
    const plain = open(this.keys.msgKey, packet);
    const msg = plain && decodeMessage(plain);
    if (!msg || msg.peer === this.self) return;
    const verdict = this.guard.accept(msg.peer, msg.seq, msg.ts);
    if (verdict === 'stale') return this.onStale(msg);
    if (verdict !== 'ok') return;
    this.staleStrikes.delete(msg.peer);

    if (msg.t === 'presence') return this.onPresence(t, key, msg);
    const m = this.members.get(msg.peer);
    if (msg.t === 'bye') {
      this.guard.markGone(msg.peer);
      if (m) this.remove(m, 'left');
      return;
    }
    if (!m) return;
    this.heard(m, t, key);
    if (this.paused || this.roomMuted || m.muted || m.needsUpdate) return;
    if (!this.limiter.allow(m.peer, this.deps.profile().limit)) return;
    const target = this.deps.resolveTarget(msg.d);
    if (!target) return;
    this.emit('remotePing', {
      displayId: target.displayId, x: msg.x * target.width, y: msg.y * target.height, id: msg.ping,
      tag: { name: m.name, color: m.color },
    } satisfies RemotePing);
  }

  private onPresence(t: Transport, key: PeerKey, msg: PresenceMsg): void {
    let m = this.members.get(msg.peer);
    const isNew = !m;
    if (!m) {
      m = { peer: msg.peer, name: msg.name, color: msg.color, status: msg.status, needsUpdate: false, muted: false, firstSeen: this.deps.now(), paths: {} };
      this.members.set(m.peer, m);
      this.aloneSince = null;
    }
    m.name = msg.name;
    m.color = msg.color;
    m.status = msg.status;
    m.needsUpdate = msg.proto !== PROTOCOL_VERSION;
    this.heard(m, t, key);
    if (!this.answered.has(key)) {
      this.answered.add(key);
      t.sendTo(key, this.presencePacket());
    }
    if (isNew && this.phase === 'active') this.emit('toast', { kind: 'joined', name: m.name } satisfies RoomToast);
    this.emitState();
  }

  /**
   * Packets more than 10 minutes off our clock. Anyone on the network can replay old ones, so they never create,
   * refresh or reach a member; a few presences only raise the room-level clock warning.
   */
  private onStale(msg: RoomMessage): void {
    if (msg.t !== 'presence') return;
    const s = this.staleStrikes.get(msg.peer) ?? { count: 0, at: 0 };
    this.staleStrikes.set(msg.peer, { count: s.count + 1, at: this.deps.now() });
    this.emitState();
  }

  private onPeerGone(t: Transport, key: PeerKey): void {
    for (const m of this.members.values()) if (m.paths[t.kind]?.key === key) delete m.paths[t.kind];
    this.answered.delete(key);
    this.emitState();
  }

  private heard(m: Member, t: Transport, key: PeerKey): void {
    m.paths[t.kind] = { key, seenAt: this.deps.now() };
  }

  private remove(m: Member, kind: 'left' | 'disconnected'): void {
    this.members.delete(m.peer);
    this.limiter.forget(m.peer);
    for (const p of Object.values(m.paths)) this.answered.delete(p.key);
    if (this.members.size === 0 && this.phase !== 'idle') this.aloneSince = this.deps.now();
    this.emit('toast', { kind, name: m.name } satisfies RoomToast);
    this.emitState();
  }

  /** LAN while it is alive, else internet, else nothing. */
  private route(m: Member): { transport: Transport; key: PeerKey } | null {
    const now = this.deps.now();
    for (const kind of ['lan', 'internet'] as const) {
      const p = m.paths[kind];
      const transport = this.deps.transports.find((t) => t.kind === kind);
      if (p && transport && now - p.seenAt < ALIVE_MS[kind]) return { transport, key: p.key };
    }
    return null;
  }

  private path(m: Member, now: number): MemberPath {
    const r = this.route(m);
    if (r) return r.transport.kind;
    return now - m.firstSeen < UNREACHABLE_MS ? 'connecting' : 'unreachable';
  }

  private status(): MemberStatus {
    return this.paused ? 'paused' : this.roomMuted ? 'muted' : 'on';
  }

  private presencePacket(): Buffer {
    const p = this.deps.profile();
    return this.seal({ t: 'presence', proto: PROTOCOL_VERSION, app: this.deps.appVersion, name: p.name, color: p.color, status: this.status() });
  }

  /** Sends presence on one transport, or all of them. */
  private announce(only?: Transport): void {
    if (!this.keys) return;
    const packet = this.presencePacket();
    for (const t of only ? [only] : this.deps.transports) {
      this.spread(t, packet);
      this.lastPresence[t.kind] = this.deps.now();
    }
  }

  /**
   * Broadcast, and on LAN also straight to every member heard there: Wi-Fi broadcast has no retries and some
   * routers filter it, unicast doesn't. Duplicates are dropped by the receiver's replay guard.
   */
  private spread(t: Transport, packet: Uint8Array): void {
    t.broadcast(packet);
    if (t.kind !== 'lan') return; // an internet broadcast already goes to each connected peer
    for (const m of this.members.values()) {
      const key = m.paths.lan?.key;
      if (key) t.sendTo(key, packet);
    }
  }

  private seal(body: Record<string, unknown>): Buffer {
    const msg = { peer: this.self, seq: ++this.seq, ts: this.deps.now(), ...body } as RoomMessage;
    return seal(this.keys!.msgKey, encodeMessage(msg));
  }

  private emitState(): void {
    const s = this.state();
    const json = JSON.stringify(s);
    if (json === this.lastState) return;
    this.lastState = json;
    this.emit('state', s);
  }
}
