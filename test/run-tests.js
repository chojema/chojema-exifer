// Integration test for the metadata module.
// Usage: node test/run-tests.js <folder with sample.jpg/png/tiff/heic/webp>
// Each sample is copied to a temp folder, edited, copied onto, and read back.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const md = require('../src/main/metadata');
const exiftool = require('../src/main/exiftool');

const sampleDir = process.argv[2];
if (!sampleDir) {
  console.error('usage: node test/run-tests.js <sample folder>');
  process.exit(2);
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'exifer-test-'));
const samples = fs.readdirSync(sampleDir)
  .filter((f) => md.SUPPORTED_EXTENSIONS.includes(path.extname(f).slice(1).toLowerCase()))
  .map((f) => {
    const dst = path.join(work, f);
    fs.copyFileSync(path.join(sampleDir, f), dst);
    return dst;
  });

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`);
  }
}

function hash(file) {
  return require('crypto').createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

(async () => {
  for (const file of samples) {
    const label = path.basename(file);
    const before = hash(file);
    let edited;

    await check(`${label}: edit dates + GPS into a new file`, async () => {
      const meta = await md.readMetadata(file);
      assert.ok(meta.supported, `unsupported type ${meta.typeLabel}`);
      const dates = md.planDates({
        type: meta.type, taken: '2020-03-15T08:30:45', modified: '2021-01-02T03:04:05',
        offset: '+09:00', gpsPresent: true, xmpGps: false, fileTimes: true,
      });
      const res = await md.saveEdits({
        file, dates, gps: { mode: 'set', lat: 37.5665, lon: 126.978, alt: 38.5 },
      });
      edited = res.output;
      assert.strictEqual(hash(file), before, 'original was modified');
      assert.ok(/[\\/]2020-03-15_08-30-45_ed( \(\d+\))?\.[a-z]+$/i.test(edited), edited);
      if (meta.type === 'PNG') {
        assert.ok(res.converted && /\.jpg$/.test(edited), `PNG not converted: ${edited}`);
      } else {
        assert.ok(!res.converted && path.extname(edited) === path.extname(file), edited);
      }

      const out = await md.readMetadata(edited);
      assert.strictEqual(out.taken, '2020-03-15T08:30:45');
      assert.strictEqual(out.modified, '2021-01-02T03:04:05');
      assert.strictEqual(out.offset, '+09:00');
      assert.ok(Math.abs(out.gps.lat - 37.5665) < 1e-6 && Math.abs(out.gps.lon - 126.978) < 1e-6, JSON.stringify(out.gps));
      assert.ok(Math.abs(out.gps.alt - 38.5) < 1e-6);
      assert.strictEqual(out.tags['GPS:GPSDateStamp'], '2020:03:14');
      assert.strictEqual(out.tags['GPS:GPSTimeStamp'], '23:30:45');
      assert.strictEqual(out.tags['XMP-xmp:CreateDate'], '2020:03:15 08:30:45+09:00');
      if (['JPEG', 'TIFF', 'PNG'].includes(meta.type)) assert.strictEqual(out.tags['IPTC:DateCreated'], '2020:03:15');
      if (meta.type === 'PNG') {
        assert.strictEqual(out.type, 'JPEG');
        assert.strictEqual(out.width, meta.width, 'width changed');
        assert.strictEqual(out.height, meta.height, 'height changed');
      }

      const st = fs.statSync(edited);
      assert.strictEqual(st.mtime.toISOString(), '2021-01-01T18:04:05.000Z', `mtime ${st.mtime.toISOString()}`);
      if (process.platform !== 'linux') {
        assert.strictEqual(st.birthtime.toISOString(), '2020-03-14T23:30:45.000Z', `birthtime ${st.birthtime.toISOString()}`);
      }
    });

    await check(`${label}: remove GPS`, async () => {
      const res = await md.saveEdits({ file: edited, dates: [], gps: { mode: 'remove' } });
      const out = await md.readMetadata(res.output);
      assert.strictEqual(out.gps, null);
      assert.ok(!Object.keys(out.tags).some((k) => k.startsWith('GPS:')), 'GPS tags remain');
      assert.strictEqual(out.taken, '2020-03-15T08:30:45');
    });

    for (const other of samples) {
      if (other === file) continue;
      await check(`${label} -> ${path.basename(other)}: copy all EXIF`, async () => {
        const targetBefore = await md.readMetadata(other);
        const res = await md.copyExif({ source: edited, target: other, mode: 'all', fileTimes: true });
        const out = await md.readMetadata(res.output);
        assert.strictEqual(out.taken, '2020-03-15T08:30:45');
        assert.ok(out.gps && Math.abs(out.gps.lat - 37.5665) < 1e-6, 'gps not copied');
        assert.strictEqual(out.width, targetBefore.width, 'dimensions changed');
        assert.ok(/[\\/]2020-03-15_08-30-45_ed( \(\d+\))?\.[a-z]+$/i.test(res.output), res.output);
        assert.strictEqual(out.type, targetBefore.type === 'PNG' ? 'JPEG' : targetBefore.type);
        assert.strictEqual(out.orientation, targetBefore.orientation, 'orientation changed');
        assert.strictEqual(fs.statSync(res.output).mtime.toISOString(), '2021-01-01T18:04:05.000Z');
      });
    }

    await check(`${label}: copy only GPS group with replace`, async () => {
      const other = samples.find((s) => s !== file);
      const res = await md.copyExif({ source: edited, target: other, mode: 'groups', groups: ['gps'], replace: true, fileTimes: false });
      const out = await md.readMetadata(res.output);
      assert.ok(out.gps, 'gps not copied');
      assert.ok(!out.tags['ExifIFD:DateTimeOriginal'], 'dates should not be copied');
    });
  }

  await check('JPEG without any metadata gets new tags', async () => {
    const jpg = samples.find((s) => /\.jpe?g$/i.test(s));
    const bare = path.join(work, 'bare.jpg');
    fs.copyFileSync(jpg, bare);
    await exiftool.write(bare, ['-all=']);
    const meta = await md.readMetadata(bare);
    assert.strictEqual(meta.taken, null);
    const dates = md.planDates({ type: meta.type, taken: '2019-07-01T12:00:00', modified: '2019-07-01T12:00:00', offset: '-05:00', gpsPresent: false, fileTimes: false });
    const res = await md.saveEdits({ file: bare, dates, gps: { mode: 'keep' } });
    const out = await md.readMetadata(res.output);
    assert.strictEqual(out.taken, '2019-07-01T12:00:00');
    assert.strictEqual(out.offset, '-05:00');
  });

  await check('PNG with alpha and PNG CreationTime converts to JPEG', async () => {
    const png = samples.find((s) => /\.png$/i.test(s));
    const src = path.join(work, 'alpha.png');
    fs.copyFileSync(png, src);
    await exiftool.write(src, ['-all=', '-PNG:CreationTime=2018:06:07 09:10:11']);
    const res = await md.saveEdits({ file: src, dates: [], gps: { mode: 'keep' } });
    assert.ok(/[\\/]2018-06-07_09-10-11_ed\.jpg$/.test(res.output), res.output);
    const out = await md.readMetadata(res.output);
    assert.strictEqual(out.type, 'JPEG');
    assert.strictEqual(out.taken, '2018-06-07T09:10:11');
  });

  await check('file without a date taken is named after its file time', async () => {
    const jpg = samples.find((s) => /\.jpe?g$/i.test(s));
    const bare = path.join(work, 'nodate.jpg');
    fs.copyFileSync(jpg, bare);
    await exiftool.write(bare, ['-all=']);
    const t = new Date(2017, 0, 2, 3, 4, 5);
    fs.utimesSync(bare, t, t);
    const res = await md.saveEdits({ file: bare, dates: [], gps: { mode: 'keep' } });
    assert.ok(/[\\/]2017-01-02_03-04-05_ed\.jpg$/.test(res.output), res.output);
  });

  console.log(failed ? `\n${failed} failed (work dir ${work})` : '\nall passed');
  if (!failed) fs.rmSync(work, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
