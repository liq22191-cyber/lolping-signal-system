import type { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { InputBridge } from '../../src/main/inputBridge';
import { RestartPolicy } from '../../src/main/restartPolicy';
import type { HelperEvent } from '../../src/shared/protocol';

const fake = resolve(__dirname, 'fixtures/fake-helper.mjs');
const bridges: InputBridge[] = [];

function bridge(mode: string, command = process.execPath): InputBridge {
  const b = new InputBridge({ command, args: [fake, mode], policy: new RestartPolicy([10, 10, 10], 3) });
  bridges.push(b);
  return b;
}

function waitFor<T>(em: EventEmitter, event: string, pred: (v: T) => boolean, ms = 4000): Promise<T> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`timed out waiting for ${event}`)), ms);
    const handler = (v: T) => {
      if (!pred(v)) return;
      clearTimeout(timer);
      em.off(event, handler);
      res(v);
    };
    em.on(event, handler);
  });
}

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((b) => b.stop()));
});

describe('InputBridge', () => {
  it('reports running and forwards events both ways', async () => {
    const b = bridge('echo');
    const running = waitFor<string>(b, 'status', (s) => s === 'running');
    b.start();
    await running;
    const echoed = waitFor<HelperEvent>(b, 'event', (e) => e.type === 'error' && e.message === 'got:setEnabled');
    b.send({ type: 'setEnabled', enabled: false });
    await echoed;
  });

  it('re-sends the last config whenever the helper becomes ready', async () => {
    const b = bridge('echo');
    b.send({
      type: 'config', trigger: 'alt', triggerVk: 0, emoteTrigger: 'ctrl', emoteTriggerVk: 0,
      clickPing: false, dragThresholdPx: 8, toggleMods: 3, toggleVk: 80, enabled: true,
    });
    const echoed = waitFor<HelperEvent>(b, 'event', (e) => e.type === 'error' && e.message === 'got:config');
    b.start();
    await echoed;
  });

  it('restarts a crashing helper and gives up after three crashes', async () => {
    const b = bridge('crash');
    const failed = waitFor<string>(b, 'status', (s) => s === 'failed');
    b.start();
    await failed;
    expect(b.status).toBe('failed');
  });

  it('treats the no-access exit as noAccess, without restarting, until retry()', async () => {
    const b = bridge('noaccess');
    const events: HelperEvent[] = [];
    b.on('event', (e: HelperEvent) => events.push(e));
    const statuses: string[] = [];
    b.on('status', (s: string) => statuses.push(s));
    const noAccess = waitFor<string>(b, 'status', (s) => s === 'noAccess');
    b.start();
    await noAccess;
    await new Promise((r) => setTimeout(r, 100)); // a restart would be scheduled after 10 ms
    expect(statuses).toEqual(['noAccess']);
    expect(events).toContainEqual({ type: 'error', code: 'noAccess', message: 'no access' });
    const again = waitFor<string>(b, 'status', (s) => s === 'starting');
    b.retry();
    await again;
  });

  it('reports a missing executable as failed instead of throwing', async () => {
    const b = bridge('echo', 'C:\\definitely\\missing\\hook-helper.exe');
    const failed = waitFor<string>(b, 'status', (s) => s === 'failed');
    expect(() => b.start()).not.toThrow();
    await failed;
  });

  it('stop() settles even when the helper never spawned', async () => {
    const b = bridge('echo', 'C:\\definitely\\missing\\hook-helper.exe');
    b.start();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<string>((res) => {
      timer = setTimeout(() => res('timed out'), 2000);
    });
    const outcome = await Promise.race([b.stop().then(() => 'settled'), timeout]);
    clearTimeout(timer);
    expect(outcome).toBe('settled');
  });

  it('stop() kills a helper that ignores shutdown and still settles', async () => {
    const b = new InputBridge({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] });
    bridges.push(b);
    b.start();
    await new Promise((res) => setTimeout(res, 300)); // let it spawn
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<string>((res) => {
      timer = setTimeout(() => res('timed out'), 3000);
    });
    const outcome = await Promise.race([b.stop().then(() => 'settled'), timeout]);
    clearTimeout(timer);
    expect(outcome).toBe('settled');
  });

  it('start() is idempotent while a helper is alive', async () => {
    const b = bridge('echo');
    let readies = 0;
    b.on('event', (e: HelperEvent) => {
      if (e.type === 'ready') readies += 1;
    });
    const firstReady = waitFor<HelperEvent>(b, 'event', (e) => e.type === 'ready');
    b.start();
    b.start();
    await firstReady;
    await new Promise((res) => setTimeout(res, 500)); // a second helper, if any, would be ready by now
    expect(readies).toBe(1);
    await b.stop();
  });

  it('stops cleanly', async () => {
    const b = bridge('echo');
    const running = waitFor<string>(b, 'status', (s) => s === 'running');
    b.start();
    await running;
    await b.stop();
    expect(b.status).toBe('running'); // stopping is not a failure
  });
});
