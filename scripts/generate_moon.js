const fs = require('fs');
const zlib = require('zlib');

function createPng(width, height, pixelShader) {
  // RGBA buffer: 4 bytes per pixel, plus 1 filter byte (0) per row
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelShader(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate crescent moon
const size = 64;
const pngBuffer = createPng(size, size, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const dx1 = x - cx;
  const dy1 = y - cy;
  const distOuter = Math.hypot(dx1, dy1);
  const rOuter = 24;

  // Cutout circle shifted right (waning crescent)
  const dx2 = x - (cx + 10);
  const dy2 = y - cy;
  const distInner = Math.hypot(dx2, dy2);
  const rInner = 22;

  // Check if inside outer circle
  if (distOuter <= rOuter) {
    // Distance to edge for antialiasing
    const outerAlpha = Math.max(0, Math.min(1, rOuter - distOuter + 0.5));
    // Cutout by inner circle
    const innerAlpha = Math.max(0, Math.min(1, distInner - rInner + 0.5));
    const alpha = outerAlpha * innerAlpha;

    if (alpha > 0.05) {
      // Glow/core color: pearlescent white with slight cyan-lavender tint
      return [248, 250, 255, Math.round(alpha * 255)];
    }
  }

  // Soft atmospheric halo around crescent
  if (distOuter <= rOuter + 6 && distInner >= rInner - 2) {
    const halo = (1 - (distOuter - rOuter) / 6) * 0.25;
    if (halo > 0) {
      return [219, 234, 254, Math.round(halo * 255)];
    }
  }

  return [0, 0, 0, 0];
});

fs.writeFileSync('assets/weather/moon-crescent.png', pngBuffer);
console.log('moon-crescent.png created successfully. Size:', pngBuffer.length);
