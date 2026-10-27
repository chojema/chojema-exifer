const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, shell, session } = require('electron');
const md = require('./metadata');
const { makePreview } = require('./preview');

app.setName('Chojema EXIFer');

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    title: 'Chojema EXIFer',
    backgroundColor: '#f6f6f4',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Links (map attribution) open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// OpenStreetMap's tile policy asks clients to identify themselves.
function identifyTileRequests() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://tile.openstreetmap.org/*'] },
    (details, callback) => {
      details.requestHeaders['User-Agent'] = `ChojemaEXIFer/${app.getVersion()} (desktop photo metadata editor)`;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}

// Wrap handlers so the renderer gets { ok, data | error } instead of Electron's
// "Error invoking remote method" prefix.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });
}

handle('pick-file', async (title) => {
  const res = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: title || '사진 선택',
    properties: ['openFile'],
    filters: [{ name: '사진', extensions: md.SUPPORTED_EXTENSIONS }],
  });
  return res.canceled ? null : res.filePaths[0];
});

handle('read', async (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!md.SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error('지원하지 않는 형식입니다. JPEG, HEIC/HEIF, TIFF, WebP, PNG 파일만 사용할 수 있습니다.');
  }
  const meta = await md.readMetadata(file);
  if (!meta.supported) throw new Error(`지원하지 않는 형식입니다 (${meta.typeLabel}).`);
  let preview = null;
  let previewError = null;
  try {
    preview = await makePreview(file, meta.type);
  } catch (e) {
    previewError = e.message;
  }
  return { ...meta, preview, previewError };
});

handle('plan-dates', async (params) => md.planDates(params));
handle('local-offset', async (local) => md.localOffsetAt(local));
handle('save-edits', async (params) => md.saveEdits(params));
handle('copy-exif', async (params) => md.copyExif(params));
handle('show-in-folder', async (file) => shell.showItemInFolder(file));

app.whenReady().then(() => {
  identifyTileRequests();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
