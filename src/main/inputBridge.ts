import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import {
  HELPER_EXIT_NO_ACCESS, parseHelperLine, serializeCommand, type HelperCommand, type HelperStatus,
} from '../shared/protocol';
import { RestartPolicy } from './restartPolicy';

export interface BridgeOptions {
  command: string;
  args?: string[];
  policy?: RestartPolicy;
  now?: () => number;
}

/**
 * Runs the hook helper, parses its stdout and restarts it when it crashes.
 * An exit with HELPER_EXIT_NO_ACCESS (macOS Accessibility missing) is not a crash: the status becomes 'noAccess'
 * and the helper stays stopped until `retry()`.
 * Events: 'event' (HelperEvent), 'status' (HelperStatus), 'log' (string).
 */
export class InputBridge extends EventEmitter {
  private child: ChildProcess | null = null;
  private stopping = false;
  private lastConfig: HelperCommand | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private current: HelperStatus = 'starting';
  private readonly policy: RestartPolicy;
  private readonly now: () => number;

  constructor(private readonly opts: BridgeOptions) {
    super();
    this.policy = opts.policy ?? new RestartPolicy();
    this.now = opts.now ?? Date.now;
  }

  get status(): HelperStatus {
    return this.current;
  }

  /** Idempotent: does nothing while a helper is alive or a restart is already scheduled. */
  start(): void {
    if (this.child || this.restartTimer) return;
    this.stopping = false;
    this.setStatus('starting');
    const child = spawn(this.opts.command, this.opts.args ?? [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    let gone = false;
    const onGone = (reason: string, code: number | null = null) => {
      if (gone) return;
      gone = true;
      if (this.child !== child) return; // superseded child: not a crash of the current helper
      this.child = null;
      this.onExit(reason, code);
    };
    child.on('error', (err) => onGone(err.message));
    child.on('exit', (code) => onGone(`exit code ${code}`, code));
    child.stdin?.on('error', () => undefined); // EPIPE after a crash; 'exit' handles it
    if (child.stdout) createInterface({ input: child.stdout }).on('line', (line) => this.onLine(line));
    if (child.stderr) createInterface({ input: child.stderr }).on('line', (line) => this.emit('log', line));
  }

  /** Sends a command. A config command is remembered and re-sent after every restart. */
  send(cmd: HelperCommand): void {
    if (cmd.type === 'config') this.lastConfig = cmd;
    this.write(cmd);
  }

  /** Manual restart after the bridge gave up. */
  retry(): void {
    this.policy.reset();
    if (!this.child && !this.restartTimer) this.start();
  }

  /** Always settles: on the child's 'exit' or 'error', or after a 1 s fallback that kills it. */
  stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        resolve();
      };
      // A child that failed to spawn emits 'error' and never 'exit'.
      child.once('exit', done);
      child.once('error', done);
      const fallback = setTimeout(() => {
        child.kill();
        done();
      }, 1000);
      this.write({ type: 'shutdown' });
      child.stdin?.end();
    });
  }

  private onLine(line: string): void {
    const ev = parseHelperLine(line);
    if (!ev) {
      this.emit('log', `unparsed helper output: ${line}`);
      return;
    }
    if (ev.type === 'ready') {
      this.setStatus('running');
      if (this.lastConfig) this.write(this.lastConfig);
    }
    this.emit('event', ev);
  }

  private onExit(reason: string, code: number | null): void {
    if (this.stopping) return;
    this.emit('log', `hook helper stopped: ${reason}`);
    if (code === HELPER_EXIT_NO_ACCESS) {
      this.setStatus('noAccess');
      return;
    }
    const delay = this.policy.onExit(this.now());
    if (delay === 'giveUp') {
      this.setStatus('failed');
      return;
    }
    this.setStatus('starting');
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start();
    }, delay);
  }

  private write(cmd: HelperCommand): void {
    const stdin = this.child?.stdin;
    if (stdin && !stdin.destroyed && stdin.writable) stdin.write(serializeCommand(cmd));
  }

  private setStatus(s: HelperStatus): void {
    if (s === this.current) return;
    this.current = s;
    this.emit('status', s);
  }
}
