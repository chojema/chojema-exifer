// Preview images for the renderer. Chromium shows JPEG/PNG/WebP directly (and applies
// EXIF orientation itself); HEIC/HEIF and TIFF are decoded here and sent as JPEG data URLs.
const fs = require('fs');
const { pathToFileURL } = require('url');
const { nativeImage } = require('electron');

const MAX_SIDE = 1600;

function fromRGBA(rgba, width, height) {
  // nativeImage bitmaps are BGRA.
  const bgra = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const out = Buffer.allocUnsafe(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    out[i] = bgra[i + 2];
    out[i + 1] = bgra[i + 1];
    out[i + 2] = bgra[i];
    out[i + 3] = bgra[i + 3];
  }
  let img = nativeImage.createFromBitmap(out, { width, height });
  if (Math.max(width, height) > MAX_SIDE) {
    img = width >= height ? img.resize({ width: MAX_SIDE }) : img.resize({ height: MAX_SIDE });
  }
  return `data:image/jpeg;base64,${img.toJPEG(85).toString('base64')}`;
}

// Returns { src, applyOrientation } — applyOrientation tells the renderer to rotate by EXIF.
async function makePreview(file, type) {
  if (type === 'JPEG' || type === 'PNG' || type === 'WEBP') {
    return { src: `${pathToFileURL(file).href}?t=${Date.now()}`, applyOrientation: false };
  }
  if (type === 'HEIC' || type === 'HEIF') {
    const decode = require('heic-decode');
    // libheif applies the HEIF rotation/mirror properties while decoding.
    const { width, height, data } = await decode({ buffer: fs.readFileSync(file) });
    return { src: fromRGBA(data, width, height), applyOrientation: false };
  }
  if (type === 'TIFF') {
    const UTIF = require('utif');
    const buf = fs.readFileSync(file);
    const ifds = UTIF.decode(buf);
    const page = ifds.find((ifd) => !ifd.t254) || ifds[0];
    UTIF.decodeImage(buf, page);
    const rgba = UTIF.toRGBA8(page);
    return { src: fromRGBA(rgba, page.width, page.height), applyOrientation: true };
  }
  return null;
}

module.exports = { makePreview };
