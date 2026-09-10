const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, pixelShader) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const trafficDir = path.join(__dirname, '..', 'assets', 'traffic');
fs.mkdirSync(trafficDir, { recursive: true });

// 1. YELLOW TAXI (32 x 16)
const taxiPng = createPng(32, 16, (x, y, w, h) => {
  // Wheels
  if ((x >= 5 && x <= 9) || (x >= 22 && x <= 26)) {
    if (y >= 11 && y <= 15) {
      if (x === 7 && y === 13) return [203, 213, 225, 255]; // hubcap
      return [15, 23, 42, 255]; // tire
    }
  }

  // Taxi Sign on roof
  if (x >= 14 && x <= 18 && y >= 2 && y <= 4) {
    return [254, 240, 138, 255]; // illuminated taxi sign
  }

  // Roof / Cabin
  if (x >= 9 && x <= 23 && y >= 5 && y <= 8) {
    // Windows
    if (x >= 11 && x <= 21 && y >= 6 && y <= 8) {
      if (x === 16) return [30, 41, 59, 255]; // pillar
      return [186, 230, 253, 255]; // light cyan glass
    }
    return [234, 179, 8, 255]; // yellow roof
  }

  // Main Body
  if (x >= 2 && x <= 29 && y >= 8 && y <= 12) {
    // Checkerboard stripe on door
    if (y === 10 && x >= 10 && x <= 22) {
      return (x % 2 === 0) ? [15, 23, 42, 255] : [250, 204, 21, 255];
    }
    // Headlight (front right)
    if (x >= 28 && y >= 9 && y <= 10) return [254, 240, 138, 255];
    // Taillight (rear left)
    if (x <= 3 && y >= 9 && y <= 10) return [239, 68, 68, 255];
    // Bumpers
    if (x < 4 || x > 27) return [71, 85, 105, 255];
    return [250, 204, 21, 255]; // Taxi yellow
  }

  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(trafficDir, 'taxi.png'), taxiPng);
console.log('taxi.png generated');

// 2. SLEEK SEDAN (32 x 14)
const sedanPng = createPng(32, 14, (x, y, w, h) => {
  // Wheels
  if ((x >= 6 && x <= 9) || (x >= 22 && x <= 25)) {
    if (y >= 10 && y <= 13) {
      if ((x === 7 || x === 8) && (y === 11 || y === 12)) return [226, 232, 240, 255]; // rim
      return [15, 23, 42, 255]; // tire
    }
  }

  // Cabin
  if (x >= 10 && x <= 22 && y >= 3 && y <= 7) {
    // Windows
    if (x >= 12 && x <= 20 && y >= 4 && y <= 7) {
      if (x === 16) return [30, 41, 59, 255]; // pillar
      return [147, 197, 253, 230]; // tinted window
    }
    return [59, 130, 246, 255]; // metallic blue roof
  }

  // Body
  if (x >= 2 && x <= 29 && y >= 7 && y <= 11) {
    // Headlight
    if (x >= 28 && y >= 8 && y <= 9) return [255, 255, 255, 255];
    // Taillight
    if (x <= 3 && y >= 8 && y <= 9) return [239, 68, 68, 255];
    // Body gradient/trim
    if (y === 7) return [96, 165, 250, 255];
    if (y === 11) return [30, 58, 138, 255];
    return [37, 99, 235, 255]; // sleek blue sedan
  }

  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(trafficDir, 'sedan.png'), sedanPng);
console.log('sedan.png generated');

// 3. CARGO TRUCK (48 x 20)
const truckPng = createPng(48, 20, (x, y, w, h) => {
  // Wheels (4 wheel sets: rear tandem, cab)
  if ((x >= 5 && x <= 8) || (x >= 11 && x <= 14) || (x >= 38 && x <= 42)) {
    if (y >= 15 && y <= 19) {
      if (y === 17) return [203, 213, 225, 255]; // lugnuts
      return [15, 23, 42, 255];
    }
  }

  // Trailer Cargo Box (x: 2 to 34, y: 2 to 15)
  if (x >= 2 && x <= 34 && y >= 2 && y <= 15) {
    // Roof clearance lights
    if (y === 2 && (x === 3 || x === 18 || x === 33)) return [251, 191, 36, 255];
    // Corrugated panel vertical accents
    if (x % 4 === 0 && y >= 4 && y <= 13) return [148, 163, 184, 255];
    // Lower reflector stripe
    if (y === 14) return (x % 3 === 0) ? [239, 68, 68, 255] : [248, 250, 252, 255];
    // Rear tail lights
    if (x <= 3 && y >= 12 && y <= 14) return [239, 68, 68, 255];
    return [226, 232, 240, 255]; // matte white/silver trailer
  }

  // Hitch connect
  if (x >= 34 && x <= 36 && y >= 12 && y <= 14) return [51, 65, 85, 255];

  // Cab (x: 36 to 46, y: 5 to 16)
  if (x >= 36 && x <= 46 && y >= 5 && y <= 16) {
    // Windshield
    if (x >= 40 && x <= 44 && y >= 6 && y <= 10) return [125, 211, 252, 255];
    // Cab roof lights
    if (y === 5 && (x === 38 || x === 42)) return [251, 191, 36, 255];
    // Headlight
    if (x >= 45 && y >= 12 && y <= 14) return [254, 240, 138, 255];
    // Bumper
    if (x >= 44 && y >= 14 && y <= 16) return [71, 85, 105, 255];
    return [220, 38, 38, 255]; // red semi cab
  }

  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(trafficDir, 'truck.png'), truckPng);
console.log('truck.png generated');

// 4. OVERHEAD TRAFFIC LIGHT GANTRY (36 x 36)
const gantryPng = createPng(36, 36, (x, y, w, h) => {
  // Vertical support pole on right (x: 31 to 33, y: 0 to 35)
  if (x >= 31 && x <= 33) return [51, 65, 85, 255];

  // Horizontal cantilever truss (x: 6 to 33, y: 4 to 7)
  if (x >= 6 && x <= 33 && y >= 4 && y <= 7) {
    if ((x + y) % 3 === 0) return [100, 116, 139, 255];
    return [30, 41, 59, 255];
  }

  // Signal Housing Box (x: 10 to 18, y: 7 to 25)
  if (x >= 10 && x <= 18 && y >= 7 && y <= 25) {
    // Outer border
    if (x === 10 || x === 18 || y === 7 || y === 25) return [15, 23, 42, 255];

    // Red lens (y: 9 to 13, x: 12 to 16)
    if (x >= 12 && x <= 16 && y >= 9 && y <= 13) return [239, 68, 68, 255];
    // Yellow lens (y: 15 to 19, x: 12 to 16)
    if (x >= 12 && x <= 16 && y >= 15 && y <= 19) return [245, 158, 11, 255];
    // Green lens (y: 21 to 25, x: 12 to 16)
    if (x >= 12 && x <= 16 && y >= 21 && y <= 25) return [34, 197, 94, 255];

    return [30, 41, 59, 255]; // housing interior
  }

  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(trafficDir, 'gantry.png'), gantryPng);
console.log('gantry.png generated');

// 5. PIXEL-ART NEON FUEL STATION & GAS PUMP (64 x 42)
const stationPng = createPng(64, 42, (x, y, w, h) => {
  // Overhead Illuminated Canopy Roof (x: 2 to 62, y: 2 to 10)
  if (x >= 2 && x <= 62 && y >= 2 && y <= 10) {
    // Neon glow border (cyan #06b6d4)
    if (x === 2 || x === 62 || y === 2 || y === 10) return [6, 182, 212, 255];
    // Neon text / logo "⚡ FUEL" in center
    if (y >= 4 && y <= 8 && x >= 24 && x <= 40) {
      if ((x + y) % 2 === 0) return [254, 240, 138, 255]; // neon gold
      return [56, 189, 248, 255]; // neon cyan
    }
    return [15, 23, 42, 255]; // dark canopy body
  }

  // Canopy Support Columns (x: 8 to 11, and x: 52 to 55, y: 11 to 32)
  if ((x >= 8 && x <= 11) || (x >= 52 && x <= 55)) {
    if (y >= 11 && y <= 32) {
      if (x === 9 || x === 53) return [148, 163, 184, 255];
      return [51, 65, 85, 255];
    }
  }

  // Service Island Concrete Curb (x: 20 to 44, y: 32 to 36)
  if (x >= 20 && x <= 44 && y >= 32 && y <= 36) {
    // Hazard stripes (black & amber)
    if ((x + y) % 4 < 2) return [245, 158, 11, 255];
    return [30, 41, 59, 255];
  }

  // Gas Pump Structure (x: 27 to 37, y: 18 to 32)
  if (x >= 27 && x <= 37 && y >= 18 && y <= 32) {
    // Pump frame border
    if (x === 27 || x === 37 || y === 18 || y === 32) return [15, 23, 42, 255];
    // Illuminated digital fuel readout display (y: 20 to 24, x: 29 to 35)
    if (y >= 20 && y <= 24 && x >= 29 && x <= 35) {
      return [34, 197, 94, 255]; // digital green meter
    }
    // Fuel nozzle / hose side mount (x: 26, y: 22 to 27)
    return [239, 68, 68, 255]; // red pump body
  }

  // Fuel Hose loop (x: 25 to 26, y: 22 to 28)
  if (x >= 25 && x <= 26 && y >= 22 && y <= 28) {
    return [30, 41, 59, 255];
  }

  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(trafficDir, 'gas_station.png'), stationPng);
console.log('gas_station.png generated');

