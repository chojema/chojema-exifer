// Reading, date/GPS editing and EXIF copying. Every write goes to a new file named
// after the date taken, "YYYY-MM-DD_HH-MM-SS_ed.<ext>"; the original is never modified.
const fs = require('fs');
const path = require('path');
const exiftool = require('./exiftool');

const SUPPORTED_TYPES = {
  JPEG: 'JPEG',
  HEIC: 'HEIC',
  HEIF: 'HEIF',
  TIFF: 'TIFF',
  WEBP: 'WebP',
  PNG: 'PNG',
};
const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'heic', 'heif', 'tif', 'tiff', 'webp', 'png'];
const IPTC_TYPES = new Set(['JPEG', 'TIFF']);
// Formats whose EXIF most viewers and photo apps ignore; edits are saved as JPEG instead.
const CONVERT_TO_JPEG = new Set(['PNG']);
const JPEG_QUALITY = 92;

function outputType(type) {
  return CONVERT_TO_JPEG.has(type) ? 'JPEG' : type;
}

// ---------- date helpers ----------

// Accepts "YYYY:MM:DD HH:MM:SS[.sss][+HH:MM|Z]" (ExifTool style) and returns parts.
function parseExifDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/);
  if (!m || m[1] === '0000') return null;
  let offset = null;
  if (m[7] === 'Z') offset = '+00:00';
  else if (m[7]) offset = m[7].length === 5 ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : m[7];
  return {
    local: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`,
    offset,
  };
}

function isValidOffset(offset) {
  return /^[+-](0\d|1[0-4]):[0-5]\d$/.test(offset);
}

// "2024-05-01T10:20:30" -> "2024:05:01 10:20:30"
function toExif(local) {
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`날짜 형식이 올바르지 않습니다: ${local}`);
  return `${m[1]}:${m[2]}:${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
}

function offsetMinutes(offset) {
  const sign = offset[0] === '-' ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return sign * (h * 60 + m);
}

// Absolute time (ms since epoch) of a local wall-clock time at the given offset.
function toEpoch(local, offset) {
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return utc - offsetMinutes(offset) * 60000;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Date -> "2024-05-01T10:20:30" in this computer's local time.
function localStamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function localOffsetAt(local) {
  const m = local && String(local).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : new Date();
  const minutes = -d.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// ---------- reading ----------

function first(tags, names) {
  for (const n of names) {
    const v = tags[n];
    if (v !== undefined && v !== null && v !== '') return { tag: n, value: v };
  }
  return null;
}

const TAKEN_SOURCES = [
  'ExifIFD:DateTimeOriginal', 'XMP-exif:DateTimeOriginal', 'XMP-photoshop:DateCreated',
  'ExifIFD:CreateDate', 'XMP-xmp:CreateDate', 'PNG:CreationTime', 'Keys:CreationDate',
];
const MODIFIED_SOURCES = ['IFD0:ModifyDate', 'XMP-xmp:ModifyDate', 'PNG:ModifyDate'];

function fileTypeKey(tags, file) {
  const t = String(tags['File:FileType'] || '').toUpperCase();
  if (SUPPORTED_TYPES[t]) return t;
  // Lossless/alpha WebP files are reported as "Extended WEBP".
  if (/\bWEBP$/.test(t)) return 'WEBP';
  // ExifTool reports some HEIF variants as e.g. "HEIC" already; fall back to the extension.
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!t && SUPPORTED_EXTENSIONS.includes(ext)) return ext === 'jpg' ? 'JPEG' : ext.toUpperCase();
  return null;
}

async function readMetadata(file) {
  const tags = await exiftool.readJson(file, ['-api', 'LargeFileSupport=1']);
  const num = await exiftool.readJson(file, [
    '-n', '-Composite:GPSLatitude', '-Composite:GPSLongitude', '-Composite:GPSAltitude',
    '-IFD0:Orientation', '-Composite:ImageSize',
  ]);
  const size = String(num['Composite:ImageSize'] || '').match(/^(\d+)\D+(\d+)$/);
  delete tags.SourceFile;

  const type = fileTypeKey(tags, file);
  const takenSrc = first(tags, TAKEN_SOURCES);
  const modSrc = first(tags, MODIFIED_SOURCES);
  const taken = takenSrc && parseExifDate(String(takenSrc.value));
  const modified = modSrc && parseExifDate(String(modSrc.value));
  const fileModified = parseExifDate(String(tags['System:FileModifyDate'] || ''));

  const offset = tags['ExifIFD:OffsetTimeOriginal'] || (taken && taken.offset)
    || tags['ExifIFD:OffsetTime'] || (modified && modified.offset) || null;

  const lat = num['Composite:GPSLatitude'];
  const lon = num['Composite:GPSLongitude'];
  const gps = typeof lat === 'number' && typeof lon === 'number'
    ? { lat, lon, alt: typeof num['Composite:GPSAltitude'] === 'number' ? num['Composite:GPSAltitude'] : null }
    : null;

  return {
    file,
    name: path.basename(file),
    type,
    typeLabel: type ? SUPPORTED_TYPES[type] : String(tags['File:FileType'] || '알 수 없음'),
    supported: Boolean(type),
    size: fs.statSync(file).size,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    orientation: num['IFD0:Orientation'] || 1,
    camera: [tags['IFD0:Make'], tags['IFD0:Model']].filter(Boolean).join(' ') || null,
    lens: tags['ExifIFD:LensModel'] || null,
    taken: taken ? taken.local : null,
    takenTag: takenSrc ? takenSrc.tag : null,
    modified: modified ? modified.local : null,
    modifiedTag: modSrc ? modSrc.tag : null,
    fileModified: fileModified ? fileModified.local : null,
    offset: offset && isValidOffset(offset) ? offset : null,
    gps,
    hasXmpGps: Object.keys(tags).some((k) => k.startsWith('XMP-exif:GPS')),
    tags,
  };
}

// ---------- date plan ----------

// Builds the list of tags written for the simple "taken / modified / offset" input.
// Each item: { tag, value, label, group }. value '' means delete the tag.
// type is the input type; tags are planned for the saved type (PNG is saved as JPEG).
function planDates({ type: inputType, taken, modified, offset, gpsPresent, xmpGps, fileTimes }) {
  if (!isValidOffset(offset)) throw new Error(`시간대 형식이 올바르지 않습니다: ${offset}`);
  const type = outputType(inputType);
  const items = [];
  const add = (group, tag, value, label) => items.push({ group, tag, value, label });

  if (taken) {
    const t = toExif(taken);
    add('EXIF', 'ExifIFD:DateTimeOriginal', t, '촬영 일시');
    add('EXIF', 'ExifIFD:CreateDate', t, '디지털화 일시');
    add('EXIF', 'ExifIFD:OffsetTimeOriginal', offset, '촬영 시간대');
    add('EXIF', 'ExifIFD:OffsetTimeDigitized', offset, '디지털화 시간대');
    add('EXIF', 'ExifIFD:SubSecTimeOriginal', '', '촬영 일시 초 이하 (삭제)');
    add('EXIF', 'ExifIFD:SubSecTimeDigitized', '', '디지털화 일시 초 이하 (삭제)');
    add('XMP', 'XMP-exif:DateTimeOriginal', t + offset, '촬영 일시');
    add('XMP', 'XMP-xmp:CreateDate', t + offset, '생성 일시');
    add('XMP', 'XMP-photoshop:DateCreated', t + offset, '생성 일시 (Photoshop)');
    if (IPTC_TYPES.has(type)) {
      add('IPTC', 'IPTC:DateCreated', t.slice(0, 10), '생성 날짜');
      add('IPTC', 'IPTC:TimeCreated', t.slice(11) + offset, '생성 시각');
      add('IPTC', 'IPTC:DigitalCreationDate', t.slice(0, 10), '디지털 생성 날짜');
      add('IPTC', 'IPTC:DigitalCreationTime', t.slice(11) + offset, '디지털 생성 시각');
    }
    if (type === 'PNG') add('PNG', 'PNG:CreationTime', t + offset, '생성 일시 (PNG)');
    if (gpsPresent) {
      const u = new Date(toEpoch(taken, offset));
      const date = `${u.getUTCFullYear()}:${pad(u.getUTCMonth() + 1)}:${pad(u.getUTCDate())}`;
      const time = `${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}:${pad(u.getUTCSeconds())}`;
      add('GPS', 'GPS:GPSDateStamp', date, 'GPS 날짜 (UTC)');
      add('GPS', 'GPS:GPSTimeStamp', time, 'GPS 시각 (UTC)');
      if (xmpGps) add('XMP', 'XMP-exif:GPSDateTime', `${date} ${time}Z`, 'GPS 일시 (XMP, UTC)');
    }
    if (fileTimes) add('파일', 'System:FileCreateDate', t + offset, '파일 생성 시각');
  }

  if (modified) {
    const m = toExif(modified);
    add('EXIF', 'IFD0:ModifyDate', m, '수정 일시');
    add('EXIF', 'ExifIFD:OffsetTime', offset, '수정 시간대');
    add('EXIF', 'ExifIFD:SubSecTime', '', '수정 일시 초 이하 (삭제)');
    add('XMP', 'XMP-xmp:ModifyDate', m + offset, '수정 일시');
    add('XMP', 'XMP-xmp:MetadataDate', m + offset, '메타데이터 수정 일시');
    if (type === 'PNG') add('PNG', 'PNG:ModifyDate', m + offset, '수정 일시 (PNG)');
    if (fileTimes) add('파일', 'System:FileModifyDate', m + offset, '파일 수정 시각');
  }
  return items;
}

// ---------- writing ----------

// "<dir>/2024-05-01_10-20-30_ed.jpg" for taken "2024-05-01T10:20:30"; " (2)" etc. if taken.
function outputPath(dir, taken, ext) {
  const m = String(taken).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  const base = `${m[1]}-${m[2]}-${m[3]}_${m[4]}-${m[5]}-${m[6] || '00'}_ed`;
  let candidate = path.join(dir, `${base}${ext}`);
  for (let i = 2; fs.existsSync(candidate); i++) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
  }
  return candidate;
}

// PNG -> JPEG. Transparent areas become white; EXIF, XMP and the ICC profile are carried
// over, and PNG CreationTime becomes DateTimeOriginal when the PNG has no EXIF date.
async function convertToJpeg(src, dst) {
  const { PNG } = require('pngjs');
  const jpeg = require('jpeg-js');
  const { width, height, data } = PNG.sync.read(fs.readFileSync(src));
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 255) continue;
    for (let c = i; c < i + 3; c++) data[c] = Math.round((data[c] * a + 255 * (255 - a)) / 255);
    data[i + 3] = 255;
  }
  fs.writeFileSync(dst, jpeg.encode({ width, height, data }, JPEG_QUALITY).data);
  await exiftool.write(dst, ['-tagsFromFile', src, '-ExifIFD:DateTimeOriginal<PNG:CreationTime', '-all:all', '-ICC_Profile']);
}

// Copies (or converts) the input to a temporary file next to it. finishWork() later
// renames it after its date taken, which is only known once the new tags are written.
async function startWork(file, type) {
  const converted = CONVERT_TO_JPEG.has(type);
  const ext = converted ? '.jpg' : path.extname(file);
  const tmp = path.join(path.dirname(file), `.exifer-${process.pid}-${Date.now()}${ext}`);
  try {
    if (converted) await convertToJpeg(file, tmp);
    else fs.copyFileSync(file, tmp);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return { tmp, ext, converted, output: null };
}

// Names the output after its date taken; without one, the original's date taken or file time.
async function finishWork(work, original) {
  const meta = await readMetadata(work.tmp);
  const taken = meta.taken || original.taken || original.fileModified || localStamp(new Date());
  work.output = outputPath(path.dirname(work.tmp), taken, work.ext);
  fs.renameSync(work.tmp, work.output);
  return meta;
}

function abortWork(work) {
  fs.rmSync(work.tmp, { force: true });
  if (work.output) fs.rmSync(work.output, { force: true });
}

function gpsArgs(gps) {
  if (!gps || gps.mode === 'keep') return [];
  if (gps.mode === 'remove') return ['-GPS:all=', '-XMP-exif:GPS*='];
  const lat = Number(gps.lat);
  const lon = Number(gps.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('위도는 -90 ~ 90 사이여야 합니다.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('경도는 -180 ~ 180 사이여야 합니다.');
  const args = [
    `-GPS:GPSVersionID=2.3.0.0`,
    `-GPS:GPSLatitude=${Math.abs(lat)}`, `-GPS:GPSLatitudeRef=${lat < 0 ? 'S' : 'N'}`,
    `-GPS:GPSLongitude=${Math.abs(lon)}`, `-GPS:GPSLongitudeRef=${lon < 0 ? 'W' : 'E'}`,
  ];
  const hasAlt = gps.alt !== null && gps.alt !== undefined && String(gps.alt).trim() !== '';
  if (hasAlt) {
    const alt = Number(gps.alt);
    if (!Number.isFinite(alt)) throw new Error('고도는 숫자여야 합니다.');
    args.push(`-GPS:GPSAltitude=${Math.abs(alt)}`, `-GPS:GPSAltitudeRef#=${alt < 0 ? 1 : 0}`);
  } else {
    args.push('-GPS:GPSAltitude=', '-GPS:GPSAltitudeRef=');
  }
  if (gps.xmp) {
    args.push(`-XMP-exif:GPSLatitude=${lat}`, `-XMP-exif:GPSLongitude=${lon}`);
    if (hasAlt) args.push(`-XMP-exif:GPSAltitude=${Math.abs(Number(gps.alt))}`, `-XMP-exif:GPSAltitudeRef#=${Number(gps.alt) < 0 ? 1 : 0}`);
  }
  return args;
}

// Sets file-system creation/modification times on the output file.
// macOS: utimes with an mtime earlier than the birth time also moves the birth time back,
// so the creation time is applied first. Windows: ExifTool writes FileCreateDate directly.
async function applyFileTimes(file, createValue, modifyValue) {
  const toDate = (v) => {
    const p = parseExifDate(v);
    return p ? new Date(toEpoch(p.local, p.offset || localOffsetAt(p.local))) : null;
  };
  const created = createValue ? toDate(createValue) : null;
  const modifiedAt = modifyValue ? toDate(modifyValue) : null;
  if (!created && !modifiedAt) return [];

  if (process.platform === 'win32') {
    const args = [];
    if (created) args.push(`-System:FileCreateDate=${createValue}`);
    if (modifiedAt) args.push(`-System:FileModifyDate=${modifyValue}`);
    return (await exiftool.write(file, args)).warnings;
  }

  const finalMtime = modifiedAt || fs.statSync(file).mtime;
  if (created) fs.utimesSync(file, created, created);
  fs.utimesSync(file, finalMtime, finalMtime);
  const warnings = [];
  if (created && Math.abs(fs.statSync(file).birthtime - created) > 2000) {
    warnings.push('이 저장 장치에서는 파일 생성 시각을 바꿀 수 없어 수정 시각만 변경했습니다.');
  }
  return warnings;
}

function tagArg(item) {
  // "#" writes the raw (numeric) value, used for a few enumerated tags.
  return item.value === '' ? `-${item.tag}=` : `-${item.tag}=${item.value}`;
}

// params: { file, dates: [{tag, value}], gps: {mode, lat, lon, alt, xmp} }
async function saveEdits({ file, dates = [], gps }) {
  const original = await readMetadata(file);
  const work = await startWork(file, original.type);
  try {
    const fileItems = dates.filter((d) => d.tag.startsWith('System:'));
    const tagItems = dates.filter((d) => !d.tag.startsWith('System:'));
    // GPS deletion would also remove GPS time stamps written in the same command.
    const filtered = gps && gps.mode === 'remove'
      ? tagItems.filter((d) => !d.tag.startsWith('GPS:') && d.tag !== 'XMP-exif:GPSDateTime')
      : tagItems;
    const args = [...gpsArgs(gps), ...filtered.map(tagArg)];
    const warnings = args.length ? (await exiftool.write(work.tmp, args)).warnings : [];
    await finishWork(work, original);
    const createItem = fileItems.find((d) => d.tag === 'System:FileCreateDate');
    const modifyItem = fileItems.find((d) => d.tag === 'System:FileModifyDate');
    warnings.push(...await applyFileTimes(work.output, createItem && createItem.value, modifyItem && modifyItem.value));
    return { output: work.output, converted: work.converted, warnings };
  } catch (e) {
    abortWork(work);
    throw e;
  }
}

// ---------- EXIF copy ----------

// Tags that describe the source image itself and must not be carried over.
const COPY_EXCLUDES = [
  '--IFD0:Orientation', '--XMP-tiff:Orientation',
  '--ExifIFD:ExifImageWidth', '--ExifIFD:ExifImageHeight',
  '--IFD0:ImageWidth', '--IFD0:ImageHeight', '--IFD0:XResolution', '--IFD0:YResolution', '--IFD0:ResolutionUnit',
  '--XMP-tiff:ImageWidth', '--XMP-tiff:ImageLength',
  '--XMP-exif:PixelXDimension', '--XMP-exif:PixelYDimension',
  '--IFD1:all', '--ThumbnailImage', '--PreviewImage', '--MPF:all',
  '--MakerNotes:all', '--ICC_Profile:all', '--XMP-xmpMM:all', '--Photoshop:all',
  '--InteropIFD:all',
];

const COPY_GROUPS = {
  dates: [
    '-ExifIFD:DateTimeOriginal', '-ExifIFD:CreateDate', '-IFD0:ModifyDate',
    '-ExifIFD:OffsetTime*', '-ExifIFD:SubSecTime*',
    '-XMP-exif:DateTimeOriginal', '-XMP-xmp:CreateDate', '-XMP-xmp:ModifyDate', '-XMP-xmp:MetadataDate',
    '-XMP-photoshop:DateCreated',
    '-IPTC:DateCreated', '-IPTC:TimeCreated', '-IPTC:DigitalCreationDate', '-IPTC:DigitalCreationTime',
    '-GPS:GPSDateStamp', '-GPS:GPSTimeStamp', '-XMP-exif:GPSDateTime',
  ],
  gps: ['-GPS:all', '-XMP-exif:GPS*'],
  camera: [
    '-IFD0:Make', '-IFD0:Model', '-ExifIFD:LensMake', '-ExifIFD:LensModel', '-ExifIFD:LensInfo',
    '-ExifIFD:LensSerialNumber', '-ExifIFD:SerialNumber', '-ExifIFD:OwnerName', '-XMP-aux:all',
  ],
  exposure: [
    '-ExifIFD:ExposureTime', '-ExifIFD:FNumber', '-ExifIFD:ISO', '-ExifIFD:ExposureProgram',
    '-ExifIFD:ExposureCompensation', '-ExifIFD:ExposureMode', '-ExifIFD:MeteringMode', '-ExifIFD:Flash',
    '-ExifIFD:FocalLength', '-ExifIFD:FocalLengthIn35mmFormat', '-ExifIFD:WhiteBalance',
    '-ExifIFD:ShutterSpeedValue', '-ExifIFD:ApertureValue', '-ExifIFD:BrightnessValue',
    '-ExifIFD:MaxApertureValue', '-ExifIFD:LightSource', '-ExifIFD:SceneCaptureType',
    '-ExifIFD:DigitalZoomRatio', '-ExifIFD:SensitivityType', '-ExifIFD:RecommendedExposureIndex',
    '-ExifIFD:SubjectDistance', '-ExifIFD:SubjectDistanceRange', '-ExifIFD:Contrast',
    '-ExifIFD:Saturation', '-ExifIFD:Sharpness', '-ExifIFD:ColorSpace',
  ],
  description: [
    '-IFD0:Artist', '-IFD0:Copyright', '-IFD0:ImageDescription', '-IFD0:Software', '-IFD0:Rating',
    '-IFD0:XPTitle', '-IFD0:XPComment', '-IFD0:XPAuthor', '-IFD0:XPKeywords', '-IFD0:XPSubject',
    '-ExifIFD:UserComment', '-XMP-dc:all', '-XMP-xmp:Rating',
    '-IPTC:By-line', '-IPTC:CopyrightNotice', '-IPTC:Caption-Abstract', '-IPTC:Keywords', '-IPTC:ObjectName',
  ],
};

// params: { source, target, mode: 'all'|'groups', groups: [...], replace, fileTimes }
async function copyExif({ source, target, mode = 'all', groups = [], replace = false, fileTimes = true }) {
  if (path.resolve(source) === path.resolve(target)) throw new Error('원본과 대상이 같은 파일입니다.');
  let tagList;
  if (mode === 'all') {
    tagList = ['-all:all', ...COPY_EXCLUDES];
  } else {
    const chosen = groups.filter((g) => COPY_GROUPS[g]);
    if (!chosen.length) throw new Error('복제할 항목을 하나 이상 선택하세요.');
    tagList = chosen.flatMap((g) => COPY_GROUPS[g]);
  }

  const original = await readMetadata(target);
  const work = await startWork(target, original.type);
  try {
    const args = [];
    if (replace) {
      // Clear the target, then restore what belongs to the target image itself.
      args.push('-all=', '-tagsFromFile', '@', '-IFD0:Orientation', '-ICC_Profile');
    }
    args.push('-tagsFromFile', source, ...tagList);
    const { warnings } = await exiftool.write(work.tmp, args);
    const meta = await finishWork(work, original);

    if (fileTimes) {
      const off = meta.offset || localOffsetAt(meta.taken);
      const create = meta.taken ? toExif(meta.taken) + off : null;
      const modify = meta.modified ? toExif(meta.modified) + (meta.offset || localOffsetAt(meta.modified)) : create;
      warnings.push(...await applyFileTimes(work.output, create, modify));
    }
    return { output: work.output, converted: work.converted, warnings };
  } catch (e) {
    abortWork(work);
    throw e;
  }
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  CONVERT_TO_JPEG,
  readMetadata,
  planDates,
  saveEdits,
  copyExif,
  localOffsetAt,
  parseExifDate,
  toEpoch,
  outputPath,
};
