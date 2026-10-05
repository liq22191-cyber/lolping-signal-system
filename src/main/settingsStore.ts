import { EventEmitter } from 'node:events';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Platform } from '../shared/platform';
import { mergeSettings, normalizeSettings, type Identity, type Settings } from '../shared/settings';

/** Windows can briefly lock the target (antivirus, indexer), failing rename with one of these codes. */
const TRANSIENT_RENAME_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** Delay before each retry: 3 attempts in total. */
const RENAME_RETRY_DELAYS_MS: readonly number[] = [50, 100];

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= RENAME_RETRY_DELAYS_MS.length || !code || !TRANSIENT_RENAME_CODES.has(code)) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt]));
    }
  }
}

/** Loads, validates and persists settings.json. Emits 'change' (Settings) after every update. */
export class SettingsStore extends EventEmitter {
  readonly file: string;
  readonly problems: string[] = [];
  /** True when load() found no settings file: lolPing's first run. */
  firstRun = false;
  private current: Settings;
  private timer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();

  /** `identity` supplies this machine's defaults for the room name and tag colour. */
  constructor(
    readonly dir: string,
    private readonly debounceMs = 300,
    private readonly platform: Platform = 'win',
    private readonly identity?: Identity,
  ) {
    super();
    this.file = join(dir, 'settings.json');
    this.current = normalizeSettings(undefined, platform, identity);
  }

  load(): Settings {
    this.firstRun = !existsSync(this.file);
    if (this.firstRun) {
      this.current = normalizeSettings(undefined, this.platform, this.identity);
      this.scheduleSave(); // keeps this machine's random tag colour from changing on the next launch
      return this.current;
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      this.current = normalizeSettings(raw, this.platform, this.identity);
      // A file from an older version lacks the newer keys: write the filled-in values once.
      const stored = typeof raw === 'object' && raw !== null ? raw : {};
      if (Object.keys(this.current).some((k) => !(k in stored))) this.scheduleSave();
    } catch (err) {
      let backup = 'it was backed up to settings.bak.json';
      try {
        copyFileSync(this.file, join(this.dir, 'settings.bak.json'));
      } catch (copyErr) {
        backup = `it could not be backed up to settings.bak.json (${(copyErr as Error).message})`;
      }
      this.problems.push(`settings.json could not be read (${(err as Error).message}); ${backup} and defaults were restored.`);
      this.current = normalizeSettings(undefined, this.platform, this.identity);
    }
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  update(patch: Partial<Settings>): Settings {
    this.current = mergeSettings(this.current, patch, this.platform, this.identity);
    this.emit('change', this.current);
    this.scheduleSave();
    return this.current;
  }

  /** Writes now via temp file + rename. Safe to call repeatedly; writes are serialized. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const data = JSON.stringify(this.current, null, 2);
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.dir, { recursive: true });
        const tmp = `${this.file}.tmp`;
        try {
          await writeFile(tmp, data, 'utf8');
          await renameWithRetry(tmp, this.file);
        } catch (err) {
          await rm(tmp, { force: true }).catch(() => undefined);
          throw err;
        }
      })
      .catch((err: Error) => {
        this.problems.push(`Could not save settings: ${err.message}`);
      });
    return this.writing;
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }
}
