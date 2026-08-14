const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');

async function removeBg(img, { tol = 9, edgeSoften = 36 } = {}) {
  const { width, height } = img.bitmap;
  const data = img.bitmap.data;
  const idx = (x, y) => (y * width + x) * 4;

  const ring = 10;
  const hist = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onBorder = x < ring || y < ring || x >= width - ring || y >= height - ring;
      if (!onBorder) continue;
      const i = idx(x, y);
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
      if (maxc - minc > 8) continue;
      const avg = Math.round((r + g + b) / 3 / 4) * 4;
      hist.set(avg, (hist.get(avg) || 0) + 1);
    }
  }
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0) || 1;
  const refTones = [255];
  for (const [tone, count] of sorted) {
    if (count / total < 0.03) break;
    if (!refTones.some(t => Math.abs(t - tone) <= tol)) refTones.push(tone);
    if (refTones.length >= 5) break;
  }

  const isBgCandidate = (x, y) => {
    const i = idx(x, y);
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
    if (maxc - minc > 10) return false;
    const avg = (r + g + b) / 3;
    return refTones.some(t => Math.abs(avg - t) <= tol);
  };

  const visited = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) { queue.push([x, 0]); queue.push([x, height - 1]); }
  for (let y = 0; y < height; y++) { queue.push([0, y]); queue.push([width - 1, y]); }

  const bg = new Uint8Array(width * height);
  while (queue.length) {
    const [x, y] = queue.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    visited[vi] = 1;
    if (!isBgCandidate(x, y)) continue;
    bg[vi] = 1;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // 2.5) Sealed background pockets: an appendage (sword, staff, hair strand) that reaches
  // close to the image border can wall off a pocket of background-tone pixels from the
  // border-seeded flood fill above, so it survives as opaque and then gets adopted into the
  // character's silhouette by the "biggest connected component" step below (it touches the
  // appendage, so it's part of that component). Find connected regions of bg-tone pixels
  // independent of border reachability and remove any region large enough that it can't be a
  // legitimate small enclosed detail (hair highlight, sparkle, drop-shadow ellipse).
  const pocketVisited = new Uint8Array(width * height);
  const minPocketArea = 25;
  for (let start = 0; start < width * height; start++) {
    if (bg[start] || pocketVisited[start]) continue;
    const sx = start % width, sy = (start / width) | 0;
    if (!isBgCandidate(sx, sy)) { pocketVisited[start] = 1; continue; }
    const comp = [start];
    pocketVisited[start] = 1;
    let head = 0;
    while (head < comp.length) {
      const p = comp[head++];
      const x = p % width, y = (p / width) | 0;
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (bg[np] || pocketVisited[np]) continue;
        pocketVisited[np] = 1;
        if (!isBgCandidate(nx, ny)) continue;
        comp.push(np);
      }
    }
    if (comp.length >= minPocketArea) {
      for (const p of comp) bg[p] = 1;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const vi = y * width + x;
      const i = idx(x, y);
      if (bg[vi]) { data[i + 3] = 0; continue; }
      let nearBg = false;
      for (let dy = -1; dy <= 1 && !nearBg; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (bg[ny * width + nx]) { nearBg = true; break; }
        }
      }
      if (nearBg) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
        if (maxc - minc <= 12) {
          const avg = (r + g + b) / 3;
          const nearest = Math.min(...refTones.map(t => Math.abs(avg - t)));
          if (nearest <= edgeSoften) {
            const alpha = Math.round(255 * (nearest / edgeSoften));
            data[i + 3] = Math.min(data[i + 3], alpha);
          }
        }
      }
    }
  }

  const alphaSrc = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) alphaSrc[p] = data[p * 4 + 3];
  const radius = 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += alphaSrc[ny * width + nx];
          count++;
        }
      }
      data[idx(x, y) + 3] = Math.round(sum / count);
    }
  }

  const alphaOpaque = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) alphaOpaque[p] = data[p * 4 + 3] > 128 ? 1 : 0;
  const compId = new Int32Array(width * height).fill(-1);
  let biggestId = -1, biggestSize = 0;
  let nextId = 0;
  const stack = [];
  for (let start = 0; start < width * height; start++) {
    if (!alphaOpaque[start] || compId[start] !== -1) continue;
    const id = nextId++;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    compId[start] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % width, y = (p / width) | 0;
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (!alphaOpaque[np] || compId[np] !== -1) continue;
        compId[np] = id;
        stack.push(np);
      }
    }
    if (size > biggestSize) { biggestSize = size; biggestId = id; }
  }
  for (let p = 0; p < width * height; p++) {
    if (alphaOpaque[p] && compId[p] !== biggestId) data[p * 4 + 3] = 0;
  }

  return refTones;
}

const names = [
  '루나리아','이그니스','실바나','녹티스','피로','네레이','솔레아','아스트라','코멧',
  '모스','마리나','브램','스파크','듀','리프','글림','애쉬','버블','클로버','더스크'
];

const srcDir = 'F:/AI/develop/game1/images';
const outDir = 'F:/AI/develop/game1/product/assets/images';
const backupDir = 'F:/AI/develop/game1/product/imgtools_tmp/backup';

async function main() {
  for (const name of names) {
    const srcPath = path.join(srcDir, `${name}SD.png`);
    const outPath = path.join(outDir, `${name}SD.png`);
    const backupPath = path.join(backupDir, `${name}SD_320.png`);
    try {
      const img = await Jimp.read(srcPath);
      img.resize({ w: 320, h: 320 });
      await img.write(backupPath);
      const tones = await removeBg(img);
      await img.write(outPath);
      console.log('OK', name, 'tones=', tones);
    } catch (e) {
      console.error('FAIL', name, e.message);
    }
  }
}
main();
