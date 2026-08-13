import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'public', 'favicon.svg');
const icoPath = path.join(root, 'public', 'favicon.ico');

const svg = readFileSync(svgPath, 'utf8').replace('<svg ', '<svg width="32" height="32" ');

const png = await sharp(Buffer.from(svg)).png().toBuffer();

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const dir = Buffer.alloc(16);
dir.writeUInt8(32, 0);
dir.writeUInt8(32, 1);
dir.writeUInt8(0, 2);
dir.writeUInt8(0, 3);
dir.writeUInt16LE(1, 4);
dir.writeUInt16LE(32, 6);
dir.writeUInt32LE(png.length, 8);
dir.writeUInt32LE(22, 12);

writeFileSync(icoPath, Buffer.concat([header, dir, png]));
console.log(`Wrote ${icoPath} (${22 + png.length} bytes)`);
