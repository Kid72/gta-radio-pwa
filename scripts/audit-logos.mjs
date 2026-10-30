#!/usr/bin/env node
/**
 * Station logo audit — "which stations have no logo?" answered with facts.
 *
 * For every station in src/data/{gtasa,gta4,gta5}.json it checks that the
 * logoUrl points at a real file in public/ and reports: exists / size /
 * extension / case-exact name / decoded pixel size / magic bytes.
 *
 * Usage: node scripts/audit-logos.mjs [--json]
 * Exit code 1 when anything is missing or broken (usable in CI).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const GAMES = ['gtasa', 'gta4', 'gta5'];

function imageSize(buf, ext) {
  try {
    if (ext === 'png' && buf.length > 24) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (ext === 'webp' && buf.length > 30) {
      const chunk = buf.subarray(12, 16).toString('ascii');
      if (chunk === 'VP8X') {
        const w = 1 + buf.readUIntLE(24, 3);
        const h = 1 + buf.readUIntLE(27, 3);
        return { w, h };
      }
      if (chunk === 'VP8 ') {
        return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      }
      if (chunk === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
      }
    }
    if ((ext === 'jpg' || ext === 'jpeg') && buf.length > 4) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
    }
    if (ext === 'svg') {
      const head = buf.subarray(0, 800).toString('utf8');
      const vb = head.match(/viewBox="([\d.\s-]+)"/i);
      if (vb) {
        const [, , w, h] = vb[1].trim().split(/\s+/);
        return { w: Math.round(Number(w)), h: Math.round(Number(h)) };
      }
      const w = head.match(/\bwidth="(\d+)"/i);
      const h = head.match(/\bheight="(\d+)"/i);
      if (w && h) return { w: Number(w[1]), h: Number(h[1]) };
    }
  } catch {
    /* unparsable dimensions are not fatal */
  }
  return null;
}

function magicOk(buf, ext) {
  if (ext === 'png') return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (ext === 'jpg' || ext === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (ext === 'webp') return buf.subarray(0, 4).toString('ascii') === 'RIFF';
  if (ext === 'svg') {
    const head = buf.subarray(0, 200).toString('utf8').trim().toLowerCase();
    return head.startsWith('<svg') || head.startsWith('<?xml');
  }
  return false;
}

const rows = [];
for (const game of GAMES) {
  const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', `${game}.json`), 'utf8'));
  for (const station of stations) {
    const url = station.logoUrl || '';
    const rel = decodeURI(url).replace(/^\/+/, '');
    const abs = path.join(PUBLIC, rel);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const row = {
      game,
      id: station.id,
      name: station.name,
      file: rel || '(empty)',
      status: 'ok',
      size: 0,
      dims: '',
      note: '',
    };

    if (!url) {
      row.status = 'no-url';
      row.note = 'logoUrl is empty';
    } else if (!fs.existsSync(abs)) {
      row.status = 'missing';
      row.note = 'file not found';
    } else {
      const buf = fs.readFileSync(abs);
      row.size = buf.length;
      const dirFiles = fs.readdirSync(path.dirname(abs));
      if (!dirFiles.includes(path.basename(abs))) {
        row.status = 'case-mismatch';
        row.note = `actual: ${dirFiles.filter((f) => f.toLowerCase() === path.basename(abs).toLowerCase()).join(', ') || 'none'}`;
      } else if (buf.length === 0) {
        row.status = 'empty';
        row.note = '0 bytes';
      } else if (!magicOk(buf, ext)) {
        row.status = 'bad-magic';
        row.note = `content is not a valid .${ext}`;
      } else {
        const dims = imageSize(buf, ext);
        row.dims = dims ? `${dims.w}x${dims.h}` : 'n/a';
        if (dims && Math.min(dims.w, dims.h) < 128) {
          row.note = 'low resolution';
        }
      }
    }
    rows.push(row);
  }
}

const bad = rows.filter((r) => r.status !== 'ok');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: rows.length, ok: rows.length - bad.length, bad, rows }, null, 2));
  process.exit(bad.length ? 1 : 0);
}

const pad = (value, width) => String(value).padEnd(width);
console.log(`STATION LOGO AUDIT — ${new Date().toISOString()}`);
console.log(`stations: ${rows.length} | ok: ${rows.length - bad.length} | broken: ${bad.length}\n`);
console.log(
  `${pad('game/station', 34)} ${pad('file', 42)} ${pad('exists', 6)} ${pad('bytes', 8)} ${pad('pixels', 10)} note`
);
console.log('-'.repeat(120));
for (const r of rows) {
  const exists = r.status === 'ok' ? 'yes' : 'NO';
  console.log(
    `${pad(`${r.game}/${r.id}`, 34)} ${pad(r.file || '-', 42)} ${pad(exists, 6)} ${pad(r.size, 8)} ${pad(r.dims || '-', 10)} ${r.status === 'ok' ? r.note || '' : `[${r.status}] ${r.note}`}`
  );
}

if (bad.length) {
  console.log('\nBROKEN:');
  for (const r of bad) console.log(`  - ${r.game}/${r.id} (${r.name}) -> ${r.file}: ${r.status} ${r.note}`);
}

// Orphans: files on disk that no station references.
const referenced = new Set(rows.map((r) => r.file));
const onDisk = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else onDisk.push(path.relative(PUBLIC, full).split(path.sep).join('/'));
  }
})(path.join(PUBLIC, 'logos'));
const orphans = onDisk.filter((f) => !referenced.has(f));
console.log(`\nfiles on disk: ${onDisk.length} | referenced: ${referenced.size} | orphans: ${orphans.length}`);
for (const f of orphans) console.log(`  orphan: ${f}`);

process.exit(bad.length ? 1 : 0);
