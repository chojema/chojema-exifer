// Thin wrapper that runs the vendored ExifTool binary with an UTF-8 argument file,
// so non-ASCII file names and values work the same on Windows and macOS.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function exiftoolPath() {
  const p = process.platform === 'win32'
    ? require('exiftool-vendored.exe')
    : require('exiftool-vendored.pl');
  // Perl and the Windows exe cannot run from inside an asar archive.
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

let argSeq = 0;

function run(args) {
  const argFile = path.join(os.tmpdir(), `chojema-exifer-${process.pid}-${Date.now()}-${argSeq++}.args`);
  const lines = ['-charset', 'filename=utf8', ...args];
  for (const line of lines) {
    if (/[\r\n]/.test(line)) throw new Error('줄바꿈이 포함된 값은 기록할 수 없습니다.');
  }
  fs.writeFileSync(argFile, lines.join('\n') + '\n', 'utf8');

  return new Promise((resolve, reject) => {
    const child = spawn(exiftoolPath(), ['-@', argFile], { windowsHide: true });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => {
      fs.rm(argFile, { force: true }, () => {});
      reject(e);
    });
    child.on('close', (code) => {
      fs.rm(argFile, { force: true }, () => {});
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
  });
}

async function readJson(file, extraArgs = []) {
  const res = await run(['-j', '-a', '-s', '-G1', ...extraArgs, file]);
  if (!res.stdout.trim()) throw new Error(res.stderr.trim() || 'ExifTool이 파일을 읽지 못했습니다.');
  return JSON.parse(res.stdout)[0];
}

// Writes in place; callers pass a copy of the original, never the original itself.
async function write(file, args) {
  const res = await run(['-overwrite_original', '-m', ...args, file]);
  const messages = res.stderr.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const errors = messages.filter((m) => m.startsWith('Error'));
  const warnings = messages.filter((m) => !m.startsWith('Error'));
  if (res.code !== 0 || errors.length) {
    throw new Error(errors.join('\n') || res.stdout.trim() || 'ExifTool 쓰기에 실패했습니다.');
  }
  return { warnings };
}

module.exports = { exiftoolPath, run, readJson, write };
