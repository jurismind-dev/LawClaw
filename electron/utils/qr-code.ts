import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { getOpenClawResolvedDir } from './paths';
import { logger } from './logger';

type QrMatrix = {
  addData: (input: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};

type QrCodeCtor = new (typeNumber: number, errorCorrectLevel: unknown) => QrMatrix;

let qrCodeCtor: QrCodeCtor | null | undefined;
let qrErrorCorrectLevel: { L: unknown } | null | undefined;

function loadQrModules(): { QRCode: QrCodeCtor; QRErrorCorrectLevel: { L: unknown } } | null {
  if (qrCodeCtor !== undefined && qrErrorCorrectLevel !== undefined) {
    if (!qrCodeCtor || !qrErrorCorrectLevel) return null;
    return { QRCode: qrCodeCtor, QRErrorCorrectLevel: qrErrorCorrectLevel };
  }

  try {
    const openclawResolvedPath = getOpenClawResolvedDir();
    const openclawRequire = createRequire(join(openclawResolvedPath, 'package.json'));
    const qrcodeTerminalPath = dirname(openclawRequire.resolve('qrcode-terminal/package.json'));

    const QRCodeModule = openclawRequire(join(qrcodeTerminalPath, 'vendor', 'QRCode', 'index.js')) as QrCodeCtor;
    const QRErrorCorrectLevelModule = openclawRequire(
      join(qrcodeTerminalPath, 'vendor', 'QRCode', 'QRErrorCorrectLevel.js')
    ) as { L: unknown };

    qrCodeCtor = QRCodeModule;
    qrErrorCorrectLevel = QRErrorCorrectLevelModule;
    return { QRCode: qrCodeCtor, QRErrorCorrectLevel: qrErrorCorrectLevel };
  } catch (error) {
    logger.warn('[QR] Failed to load qrcode-terminal modules:', error);
    qrCodeCtor = null;
    qrErrorCorrectLevel = null;
    return null;
  }
}

function createQrMatrix(input: string): QrMatrix | null {
  const modules = loadQrModules();
  if (!modules) return null;

  const qr = new modules.QRCode(-1, modules.QRErrorCorrectLevel.L);
  qr.addData(input);
  qr.make();
  return qr;
}

function fillPixel(
  buf: Buffer,
  x: number,
  y: number,
  width: number,
  r: number,
  g: number,
  b: number,
  a = 255
): void {
  const idx = (y * width + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRgba(buffer: Buffer, width: number, height: number): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rawOffset = row * (stride + 1);
    raw[rawOffset] = 0;
    buffer.copy(raw, rawOffset + 1, row * stride, row * stride + stride);
  }
  const compressed = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function renderQrPngBase64(
  input: string,
  opts: { scale?: number; marginModules?: number } = {}
): string | null {
  const matrix = createQrMatrix(input);
  if (!matrix) return null;

  const { scale = 6, marginModules = 4 } = opts;
  const modules = matrix.getModuleCount();
  const size = (modules + marginModules * 2) * scale;
  const buf = Buffer.alloc(size * size * 4, 255);

  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!matrix.isDark(row, col)) continue;
      const startX = (col + marginModules) * scale;
      const startY = (row + marginModules) * scale;
      for (let y = 0; y < scale; y += 1) {
        const pixelY = startY + y;
        for (let x = 0; x < scale; x += 1) {
          const pixelX = startX + x;
          fillPixel(buf, pixelX, pixelY, size, 0, 0, 0, 255);
        }
      }
    }
  }

  const png = encodePngRgba(buf, size, size);
  return png.toString('base64');
}
