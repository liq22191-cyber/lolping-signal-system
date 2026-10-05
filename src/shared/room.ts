import type { MemberStatus } from './roomProtocol';

export type TransportStatus = 'off' | 'starting' | 'ok' | 'unavailable';
export type MemberPath = 'lan' | 'internet' | 'connecting' | 'unreachable';

export interface RoomMember {
  peer: string;
  name: string;
  /** Index into TAG_COLORS. */
  color: number;
  path: MemberPath;
  status: MemberStatus;
  needsUpdate: boolean;
  /** Muted by us, for this session. */
  muted: boolean;
  self: boolean;
}

export interface RoomStateCore {
  phase: 'idle' | 'joining' | 'active';
  /** Display form, PING-XXXXX-XXXXX. */
  code: string | null;
  /** Us first, then everyone else in the order they appeared. */
  members: RoomMember[];
  lan: TransportStatus;
  internet: TransportStatus;
  /** In a room and alone for 20 s: the code may be wrong. */
  lonely: boolean;
  /**
   * Someone with the room key keeps sending packets more than 10 minutes off our clock: a device with a wrong clock,
   * or old packets replayed. Only a hint: such packets never add a member.
   */
  clockSkew: boolean;
}

/** What the settings window shows: the room plus this machine's display numbers. */
export interface RoomState extends RoomStateCore {
  displays: { number: number; width: number; height: number; primary: boolean }[];
}

export type JoinResult = { ok: true } | { ok: false; error: 'invalid' | 'mistyped' | 'failed' };
