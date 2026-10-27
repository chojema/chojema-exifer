// Renders build/icon.svg into the app icons used by electron-builder:
//   build/icon.png  (1024, macOS grid with margins; also the source for icon.icns)
//   build/icon.icns (macOS, via iconutil — macOS only)
//   build/icon.ico  (Windows, near full-bleed, 16–256 px PNG entries)
// Usage: npx electron scripts/make-icons.js
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');

// Windows icons don't use the macOS margin; enlarge the artwork to fill the canvas.
const winSvg = svg.replace('<g id="art">', '<g id="art" transform="translate(512 512) scale(1.12) translate(-512 -512)">');

async function render(source, size) {
  const win = new BrowserWindow({
    width: size, height: size, show: false, frame: false, transparent: true,
    useContentSize: true, webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(1);
  const html = `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`;
  const tmp = path.join(os.tmpdir(), `exifer-icon-${process.pid}-${size}-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
  fs.rmSync(tmp, { force: true });
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  win.destroy();
  return img.getSize().width === size ? img : img.resize({ width: size, height: size, quality: 'best' });
}

// Small sizes are downscaled from the 1024 render (offscreen windows can't be tiny).
function scaled(img, size) {
  return size === img.getSize().width ? img : img.resize({ width: size, height: size, quality: 'best' });
}

function writeIco(file, pngs) {
  // ICO with PNG-compressed entries (supported since Windows Vista).
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  fs.writeFileSync(file, Buffer.concat([header, ...pngs.map((p) => p.data)]));
}

app.disableHardwareAcceleration();
// Each render closes its window; don't let that end the app before all icons are written.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const mac = await render(svg, 1024);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), mac.toPNG());

  if (process.platform === 'darwin') {
    const set = fs.mkdtempSync(path.join(os.tmpdir(), 'exifer-icon-')) + '/icon.iconset';
    fs.mkdirSync(set);
    for (const s of [16, 32, 128, 256, 512]) {
      fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), scaled(mac, s).toPNG());
      fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), scaled(mac, s * 2).toPNG());
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(buildDir, 'icon.icns')]);
    fs.rmSync(path.dirname(set), { recursive: true, force: true });
  }

  const winBig = await render(winSvg, 1024);
  const pngs = [16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, data: scaled(winBig, s).toPNG() }));
  writeIco(path.join(buildDir, 'icon.ico'), pngs);

  console.log('make-icons: wrote build/icon.png, build/icon.ico' + (process.platform === 'darwin' ? ', build/icon.icns' : ''));
  app.quit();
});
