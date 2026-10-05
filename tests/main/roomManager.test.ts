import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { open, seal, type RoomKeys } from '../../src/main/roomCrypto';
import { RoomManager, type RemotePing, type RoomToast } from '../../src/main/roomManager';
import { formatRoomCode, makeRoomCode } from '../../src/shared/roomCode';
import { decodeMessage, encodeMessage, type RoomMessage } from '../../src/shared/roomProtocol';
import { FakeTransport } from './fixtures/fakeTransport';

const KEYS: RoomKeys = { msgKey: Buffer.alloc(32, 1), sigRoomId: 'room', sigPassword: 'pw' };
const CODE = makeRoomCode(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]));
const SELF = 'abababababababab';

/** Another lolPing in the room, sending through the fake transport. */
class Remote {
  seq = 0;
  constructor(readonly peer: string, readonly key: string, readonly lan: FakeTransport) {}
  packet(m: Record<string, unknown>, key = KEYS.msgKey): Buffer {
    return seal(key, encodeMessage({ peer: this.peer, seq: ++this.seq, ts: Date.now(), ...m } as RoomMessage));
  }
  presence(extra: Record<string, unknown> = {}): void {
    this.lan.deliver(this.key, this.packet({ t: 'presence', proto: 1, app: '0.3.0', name: `P${this.peer[0]}`, color: 2, status: 'on', ...extra }));
  }
  ping(extra: Record<string, unknown> = {}): void {
    this.lan.deliver(this.key, this.packet({ t: 'ping', ping: 'danger', d: 1, x: 0.5, y: 0.25, ...extra }));
  }
  bye(): void {
    this.lan.deliver(this.key, this.packet({ t: 'bye' }));
  }
}

let lan: FakeTransport;
let room: RoomManager;
let profile: { name: string; color: number; limit: number };
let pings: RemotePing[];
let toasts: RoomToast[];
let saved: (string | null)[];

function sentMessages(to?: string): RoomMessage[] {
  return lan.sent
    .filter((s) => to === undefined || s.to === to)
    .map((s) => decodeMessage(open(KEYS.msgKey, s.packet)!)!);
}

async function joinActive(): Promise<void> {
  expect(await room.join(formatRoomCode(CODE))).toEqual({ ok: true });
  await vi.advanceTimersByTimeAsync(3000);
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_780_000_000_000 });
  lan = new FakeTransport('lan');
  profile = { name: 'Me', color: 1, limit: 5 };
  pings = [];
  toasts = [];
  saved = [];
  room = new RoomManager({
    transports: [lan],
    now: () => Date.now(),
    randomBytes: (n) => new Uint8Array(n).fill(0xab),
    deriveKeys: async () => KEYS,
    appVersion: '0.3.0',
    profile: () => profile,
    resolveTarget: (d) => (d === 1 ? { displayId: 100, width: 1920, height: 1080 } : null),
  });
  room.on('remotePing', (p: RemotePing) => pings.push(p));
  room.on('toast', (t: RoomToast) => toasts.push(t));
  room.on('saveCode', (c: string | null) => saved.push(c));
});

afterEach(() => {
  room.quit();
  vi.useRealTimers();
});

describe('joining', () => {
  it('create() joins a new room, announces itself and becomes active after 3 s', async () => {
    await room.create();
    expect(room.state().phase).toBe('joining');
    expect(lan.started).toBe(KEYS);
    expect(sentMessages('*')[0]).toMatchObject({ t: 'presence', peer: SELF, name: 'Me', color: 1, status: 'on', proto: 1 });
    await vi.advanceTimersByTimeAsync(3000);
    const s = room.state();
    expect(s.phase).toBe('active');
    expect(s.code).toMatch(/^PING-/);
    expect(saved).toHaveLength(1);
    expect(toasts).toEqual([{ kind: 'joinedRoom', code: s.code }]);
  });

  it('rejects text without a code, and a mistyped code, without starting anything', async () => {
    expect(await room.join('hello')).toEqual({ ok: false, error: 'invalid' });
    const typo = CODE.slice(0, 9) + (CODE[9] === '0' ? '1' : '0');
    expect(await room.join(typo)).toEqual({ ok: false, error: 'mistyped' });
    expect(lan.started).toBeNull();
    expect(room.state().phase).toBe('idle');
  });

  it('leaves a room that already has 8 other members', async () => {
    await room.join(CODE);
    for (let i = 0; i < 8; i++) new Remote(`${i}`.repeat(16), `lan:10.0.0.${i}:47474`, lan).presence();
    await vi.advanceTimersByTimeAsync(3000);
    expect(room.state().phase).toBe('idle');
    expect(toasts).toEqual([{ kind: 'full' }]);
    expect(sentMessages('*').at(-1)?.t).toBe('bye');
    expect(lan.started).toBeNull();
    expect(saved).toEqual([]);
  });

  it('joining another room leaves the first one', async () => {
    await joinActive();
    const other = makeRoomCode(Uint8Array.from([9, 9, 9, 9, 9, 9, 9, 9, 9]));
    await room.join(other);
    expect(sentMessages('*').some((m) => m.t === 'bye')).toBe(true);
    expect(room.state().code).toBe(formatRoomCode(other));
  });
});

describe('members', () => {
  it('adds a member on presence and answers it once, directly', async () => {
    await joinActive();
    const alex = new Remote('1111111111111111', 'lan:10.0.0.2:47474', lan);
    alex.presence({ name: 'Alex', color: 4 });
    alex.presence({ name: 'Alex', color: 4 });
    expect(sentMessages('lan:10.0.0.2:47474').filter((m) => m.t === 'presence')).toHaveLength(1);
    const s = room.state();
    expect(s.members[0]).toMatchObject({ self: true, name: 'Me' });
    expect(s.members[1]).toMatchObject({ peer: alex.peer, name: 'Alex', color: 4, path: 'lan', status: 'on', self: false });
    expect(toasts.at(-1)).toEqual({ kind: 'joined', name: 'Alex' });
  });

  it('does not toast members that were already there when joining', async () => {
    await room.join(CODE);
    new Remote('1111111111111111', 'lan:a', lan).presence();
    await vi.advanceTimersByTimeAsync(3000);
    expect(toasts.map((t) => t.kind)).toEqual(['joinedRoom']);
  });

  it('marks a member on another protocol version as needing an update', async () => {
    await joinActive();
    new Remote('1111111111111111', 'lan:a', lan).presence({ proto: 2 });
    expect(room.state().members[1].needsUpdate).toBe(true);
  });

  it('ignores packets sealed with another key, and its own messages', async () => {
    await joinActive();
    const stranger = new Remote('1111111111111111', 'lan:a', lan);
    lan.deliver('lan:a', stranger.packet({ t: 'presence', proto: 1, app: '1', name: 'X', color: 0, status: 'on' }, Buffer.alloc(32, 2)));
    new Remote(SELF, 'lan:me', lan).presence();
    expect(room.state().members).toHaveLength(1);
  });

  it('falls back to connecting after 6 s of silence and drops the member after 15 s', async () => {
    await joinActive();
    new Remote('1111111111111111', 'lan:a', lan).presence({ name: 'Alex' });
    await vi.advanceTimersByTimeAsync(6000);
    expect(room.state().members[1].path).toBe('connecting');
    await vi.advanceTimersByTimeAsync(9000);
    expect(room.state().members).toHaveLength(1);
    expect(toasts.at(-1)).toEqual({ kind: 'disconnected', name: 'Alex' });
  });

  it('gives members a fresh grace period after the computer slept, instead of "disconnected" toasts', async () => {
    await joinActive();
    new Remote('1111111111111111', 'lan:a', lan).presence({ name: 'Alex' });
    vi.setSystemTime(Date.now() + 60_000); // asleep: the clock moved, no timers ran
    await vi.advanceTimersByTimeAsync(1000);
    expect(room.state().members.map((m) => m.name)).toEqual(['Me', 'Alex']);
    expect(toasts.some((t) => t.kind === 'disconnected')).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000); // and really gone: dropped as usual
    expect(room.state().members).toHaveLength(1);
    expect(toasts.at(-1)).toEqual({ kind: 'disconnected', name: 'Alex' });
  });

    it('removes a member that says bye and ignores it afterwards', async () => {
    await joinActive();
    const alex = new Remote('1111111111111111', 'lan:a', lan);
    alex.presence({ name: 'Alex' });
    alex.bye();
    expect(room.state().members).toHaveLength(1);
    expect(toasts.at(-1)).toEqual({ kind: 'left', name: 'Alex' });
    alex.presence({ name: 'Alex' });
    expect(room.state().members).toHaveLength(1);
  });

  /** A presence sealed with the room key but stamped an hour ago: a captured packet replayed later, or a bad clock. */
  const stalePresence = (r: Remote, name = 'Old') => lan.deliver(r.key, seal(KEYS.msgKey, encodeMessage({
    t: 'presence', peer: r.peer, seq: ++r.seq, ts: Date.now() - 3_600_000, proto: 1, app: '1', name, color: 0, status: 'on',
  })));

  it('never adds, answers or counts a member from stale packets, so replays cannot fill the room', async () => {
    await room.join(CODE);
    const ghosts = Array.from({ length: 8 }, (_, i) => new Remote(`${i}`.repeat(16), `lan:66.6.6.6:${i}`, lan));
    lan.sent = [];
    for (const g of ghosts) for (let n = 0; n < 4; n++) stalePresence(g, `Old${g.peer[0]}`);
    await vi.advanceTimersByTimeAsync(3000);
    expect(room.state().phase).toBe('active');
    expect(room.state().members).toHaveLength(1);
    expect(lan.sent.filter((s) => s.to.startsWith('lan:66.6.6.6'))).toHaveLength(0);
    expect(toasts.map((t) => t.kind)).toEqual(['joinedRoom']);
  });

  it('warns about a clock more than 10 minutes off without adding anyone, then clears', async () => {
    await joinActive();
    const late = new Remote('1111111111111111', 'lan:a', lan);
    stalePresence(late);
    stalePresence(late);
    expect(room.state().clockSkew).toBe(false);
    stalePresence(late);
    expect(room.state()).toMatchObject({ clockSkew: true, members: [expect.objectContaining({ self: true })] });
    expect(room.state().members).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(room.state().clockSkew).toBe(false);
  });

  it('becomes lonely after 20 s alone', async () => {
    await joinActive();
    expect(room.state().lonely).toBe(false);
    await vi.advanceTimersByTimeAsync(17_000);
    expect(room.state().lonely).toBe(true);
    new Remote('1111111111111111', 'lan:a', lan).presence();
    expect(room.state().lonely).toBe(false);
  });
});

describe('incoming pings', () => {
  let alex: Remote;
  beforeEach(async () => {
    await joinActive();
    alex = new Remote('1111111111111111', 'lan:a', lan);
    alex.presence({ name: 'Alex', color: 4 });
  });

  it('maps a ping onto the target display with the sender’s tag', () => {
    alex.ping({ ping: 'push', x: 0.5, y: 0.25 });
    expect(pings).toEqual([{ displayId: 100, x: 960, y: 270, id: 'push', tag: { name: 'Alex', color: 4 } }]);
  });

  it('shows a packet that arrives twice only once', () => {
    const packet = alex.packet({ t: 'ping', ping: 'danger', d: 1, x: 0, y: 0 });
    lan.deliver('lan:a', packet);
    lan.deliver('lan:b', packet);
    expect(pings).toHaveLength(1);
  });

  it('drops pings from strangers, while paused, while the room is muted and from muted members', () => {
    new Remote('2222222222222222', 'lan:c', lan).ping();
    room.setStatusFlags({ paused: true, roomMuted: false });
    alex.ping();
    room.setStatusFlags({ paused: false, roomMuted: true });
    alex.ping();
    room.setStatusFlags({ paused: false, roomMuted: false });
    room.muteMember(alex.peer, true);
    alex.ping();
    expect(pings).toHaveLength(0);
    room.muteMember(alex.peer, false);
    alex.ping();
    expect(pings).toHaveLength(1);
  });

  it('drops pings from a member that needs an update', () => {
    alex.presence({ proto: 2 });
    alex.ping();
    expect(pings).toHaveLength(0);
  });

  it('rate-limits each member, 0 meaning unlimited', () => {
    profile.limit = 2;
    for (let i = 0; i < 5; i++) alex.ping();
    expect(pings).toHaveLength(2);
    profile.limit = 0;
    for (let i = 0; i < 50; i++) alex.ping();
    expect(pings).toHaveLength(52);
  });

  it('drops a ping when there is no display to show it on', () => {
    alex.ping({ d: 3 }); // this setup's resolveTarget only knows display 1
    expect(pings).toHaveLength(0);
  });
});

describe('outgoing', () => {
  it('sends a ping to each member over its path, and nothing when idle or paused', async () => {
    room.sendPing('omw', { d: 1, x: 0.1, y: 0.2 });
    expect(lan.sent).toHaveLength(0);
    await joinActive();
    new Remote('1111111111111111', 'lan:a', lan).presence();
    new Remote('2222222222222222', 'lan:b', lan).presence();
    lan.sent = [];
    room.sendPing('omw', { d: 1, x: 0.1, y: 0.2 });
    expect(lan.sent.map((s) => s.to).sort()).toEqual(['lan:a', 'lan:b']);
    expect(sentMessages('lan:a')[0]).toMatchObject({ t: 'ping', ping: 'omw', d: 1, x: 0.1, y: 0.2, peer: SELF });
    lan.sent = [];
    room.setStatusFlags({ paused: true, roomMuted: false });
    lan.sent = [];
    room.sendPing('omw', { d: 1, x: 0.1, y: 0.2 });
    expect(lan.sent).toHaveLength(0);
    room.setStatusFlags({ paused: false, roomMuted: true });
    lan.sent = [];
    room.sendPing('omw', { d: 1, x: 0.1, y: 0.2 });
    expect(lan.sent).toHaveLength(2);
  });

  it('announces a status change right away', async () => {
    await joinActive();
    lan.sent = [];
    room.setStatusFlags({ paused: true, roomMuted: false });
    expect(sentMessages('*')).toEqual([expect.objectContaining({ t: 'presence', status: 'paused' })]);
    lan.sent = [];
    room.setStatusFlags({ paused: false, roomMuted: true });
    expect(sentMessages('*')).toEqual([expect.objectContaining({ t: 'presence', status: 'muted' })]);
  });

  it('also sends presence and bye straight to known members (Wi-Fi broadcast is lossy)', async () => {
    await joinActive();
    new Remote('1111111111111111', 'lan:a', lan).presence();
    lan.sent = [];
    room.setStatusFlags({ paused: true, roomMuted: false });
    expect(sentMessages('lan:a')).toEqual([expect.objectContaining({ t: 'presence', status: 'paused' })]);
    lan.sent = [];
    room.leave();
    expect(sentMessages('lan:a').map((m) => m.t)).toEqual(['bye']);
  });

  it('announces on a transport as soon as it comes up (after a bind or rebind)', async () => {
    await joinActive();
    lan.sent = [];
    lan.setStatus('starting');
    lan.setStatus('ok');
    expect(sentMessages('*')).toEqual([expect.objectContaining({ t: 'presence' })]);
  });

  it('re-announces every 2 s and after a profile change', async () => {
    await joinActive();
    lan.sent = [];
    await vi.advanceTimersByTimeAsync(2000);
    expect(sentMessages('*').filter((m) => m.t === 'presence').length).toBeGreaterThanOrEqual(1);
    lan.sent = [];
    profile.name = 'Renamed';
    room.profileChanged();
    expect(sentMessages('*')).toEqual([expect.objectContaining({ name: 'Renamed' })]);
  });

  it('leave() says bye, stops and forgets the code; quit() keeps it', async () => {
    await joinActive();
    lan.sent = [];
    room.leave();
    expect(sentMessages('*').map((m) => m.t)).toEqual(['bye']);
    expect(lan.started).toBeNull();
    expect(saved.at(-1)).toBeNull();
    expect(room.state()).toMatchObject({ phase: 'idle', code: null, members: [] });

    await joinActive();
    const before = saved.length;
    room.quit();
    expect(saved).toHaveLength(before);
    expect(room.state().phase).toBe('idle');
  });

  it('uses a new peer ID on every join, so leaving and coming back is not mistaken for a replay', async () => {
    let n = 0;
    const fresh = new RoomManager({
      transports: [lan], now: () => Date.now(), randomBytes: (k) => Uint8Array.from({ length: k }, () => ++n & 255),
      deriveKeys: async () => KEYS, appVersion: '0.3.0', profile: () => profile, resolveTarget: () => null,
    });
    await fresh.join(CODE);
    const first = sentMessages('*').at(-1)!;
    fresh.leave();
    lan.sent = [];
    await fresh.join(CODE);
    const second = sentMessages('*')[0];
    expect(second.peer).not.toBe(first.peer);
    expect(second.seq).toBe(1);
    fresh.quit();
  });

  it('goes back to idle and reports failure when the keys cannot be derived', async () => {
    const broken = new RoomManager({
      transports: [lan], now: () => Date.now(), randomBytes: (k) => new Uint8Array(k), appVersion: '0.3.0',
      deriveKeys: async () => { throw new Error('out of memory'); }, profile: () => profile, resolveTarget: () => null,
    });
    expect(await broken.join(CODE)).toEqual({ ok: false, error: 'failed' });
    expect(broken.state().phase).toBe('idle');
    await expect(broken.create()).resolves.toBeUndefined();
    expect(broken.state().phase).toBe('idle');
    expect(lan.started).toBeNull();
  });

    it('a leave() while the keys are still being derived wins', async () => {
    const pending = room.join(CODE);
    room.leave();
    await pending;
    await vi.advanceTimersByTimeAsync(3000);
    expect(room.state().phase).toBe('idle');
    expect(lan.started).toBeNull();
  });
});

describe('two transports', () => {
  let net: FakeTransport;
  let both: RoomManager;
  let got: RemotePing[];
  beforeEach(async () => {
    net = new FakeTransport('internet');
    got = [];
    both = new RoomManager({
      transports: [lan, net], now: () => Date.now(), randomBytes: (n) => new Uint8Array(n).fill(0xcd),
      deriveKeys: async () => KEYS, appVersion: '0.3.0', profile: () => profile,
      resolveTarget: () => ({ displayId: 1, width: 100, height: 100 }),
    });
    both.on('remotePing', (p: RemotePing) => got.push(p));
    await both.join(CODE);
    await vi.advanceTimersByTimeAsync(3000);
  });
  afterEach(() => both.quit());

  it('uses LAN while it is alive, falls back to the internet, and returns to LAN', async () => {
    const alex = new Remote('1111111111111111', 'lan:a', lan);
    alex.presence();
    net.deliver('net:x', alex.packet({ t: 'presence', proto: 1, app: '1', name: 'Alex', color: 1, status: 'on' }));
    expect(both.state().members[1].path).toBe('lan');
    await vi.advanceTimersByTimeAsync(6000);
    net.deliver('net:x', alex.packet({ t: 'presence', proto: 1, app: '1', name: 'Alex', color: 1, status: 'on' }));
    expect(both.state().members[1].path).toBe('internet');
    lan.sent = [];
    net.sent = [];
    both.sendPing('omw', { d: 1, x: 0, y: 0 });
    expect([lan.sent.length, net.sent.map((s) => s.to)]).toEqual([0, ['net:x']]);
    alex.presence();
    expect(both.state().members[1].path).toBe('lan');
  });

  it('shows a ping that arrives over both transports once', () => {
    const alex = new Remote('1111111111111111', 'lan:a', lan);
    alex.presence();
    const packet = alex.packet({ t: 'ping', ping: 'push', d: 1, x: 0.5, y: 0.5 });
    lan.deliver('lan:a', packet);
    net.deliver('net:x', packet);
    expect(got).toHaveLength(1);
  });

  it('unicasts presence only on LAN (an internet broadcast already reaches each peer)', () => {
    new Remote('1111111111111111', 'lan:a', lan).presence();
    net.deliver('net:x', new Remote('2222222222222222', 'net:x', lan).packet({ t: 'presence', proto: 1, app: '1', name: 'B', color: 1, status: 'on' }));
    lan.sent = [];
    net.sent = [];
    both.profileChanged();
    expect(lan.sent.map((s) => s.to).sort()).toEqual(['*', 'lan:a']);
    expect(net.sent.map((s) => s.to)).toEqual(['*']);
  });
});

