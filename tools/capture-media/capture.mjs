// Renders the README and link-preview media from the built demo page (site/):
//   docs/media/demo.gif        Enemy Missing pings on a "not responding" dialog
//   docs/media/demo.zh-CN.gif  the same scene in Chinese, for README.zh-CN.md
//   docs/media/og.png    1200×630 still for link previews (Discord, X, GitHub social preview)
//
// Run `npm run media` (it builds the site first). Needs ffmpeg on PATH.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { app, BrowserWindow } from 'electron';

const SITE = resolve('site-dist');
const OUT = resolve('docs/media');
const GIF_WIDTH = 880;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav' };

function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const file = resolve(SITE, `.${path.endsWith('/') ? `${path}index.html` : path}`);
    if (!file.startsWith(SITE + sep) || !existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function open(url, width, height) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setFrameRate(30);
  await win.loadURL(url);
  // Fonts, textures and decoded sounds.
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 1200)))');
  return win;
}

async function recordGif(url, file) {
  const win = await open(url, 1600, 900);
  const dir = mkdtempSync(join(tmpdir(), 'lolping-frames-'));
  const frames = [];
  win.webContents.on('paint', (_e, _dirty, image) => {
    const name = `f${String(frames.length).padStart(5, '0')}.png`;
    writeFileSync(join(dir, name), image.resize({ width: GIF_WIDTH, quality: 'good' }).toPNG());
    frames.push({ name, t: performance.now() });
  });
  win.webContents.invalidate();
  await win.webContents.executeJavaScript('window.lolpingDemo.play()');
  const end = performance.now();
  win.destroy();

  // Paint events only come when something changes, so each frame lasts until the next one.
  const list = frames.map((f, i) => `file '${f.name}'\nduration ${(((frames[i + 1]?.t ?? end) - f.t) / 1000).toFixed(4)}`);
  writeFileSync(join(dir, 'list.txt'), `${list.join('\n')}\nfile '${frames.at(-1).name}'\n`);
  const filter =
    'fps=20,split[a][b];' +
    '[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', filter, '-loop', '0', join(OUT, file)]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${file}: ${frames.length} frames`);
}

async function stillOg(url) {
  const win = await open(url, 1200, 630);
  await win.webContents.executeJavaScript('window.lolpingDemo.pose(), new Promise((r) => setTimeout(r, 900))');
  const image = await win.webContents.capturePage();
  writeFileSync(join(OUT, 'og.png'), image.resize({ width: 1200, height: 630, quality: 'best' }).toPNG());
  win.destroy();
  console.log('og.png');
}

app.disableHardwareAcceleration();
// Closing one capture window before opening the next must not end the app.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    mkdirSync(OUT, { recursive: true });
    const server = await serve();
    const url = `http://127.0.0.1:${server.address().port}/?capture=hung`;
    await recordGif(url, 'demo.gif');
    await recordGif(`${url}&lang=zh`, 'demo.zh-CN.gif');
    await stillOg(url);
    server.close();
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
