const path = require('path');
const { Jimp } = require('jimp');

// Some source SD portraits have a checkerboard "fake transparency" pattern baked in as
// opaque pixels (two alternating achromatic gray tones) instead of real alpha or plain
// white. Auto-detect the border's dominant achromatic tones (white + checker grays) and
// flood-fill any of them starting from the image edge.
async function removeBg(inputPath, outputPath, { tol = 9, edgeSoften = 36 } = {}) {
  const img = await Jimp.read(inputPath);
  const { width, height } = img.bitmap;
  const data = img.bitmap.data;
  const idx = (x, y) => (y * width + x) * 4;

  // 1) detect reference achromatic tones from a border ring
  const ring = 10;
  const hist = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onBorder = x < ring || y < ring || x >= width - ring || y >= height - ring;
      if (!onBorder) continue;
      const i = idx(x, y);
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
      if (maxc - minc > 8) continue; // skip chromatic pixels (character bleeding into ring)
      const avg = Math.round((r + g + b) / 3 / 4) * 4; // bucket by 4
      hist.set(avg, (hist.get(avg) || 0) + 1);
    }
  }
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0) || 1;
  const refTones = [255]; // always allow plain white
  for (const [tone, count] of sorted) {
    if (count / total < 0.03) break; // ignore noise
    if (!refTones.some(t => Math.abs(t - tone) <= tol)) refTones.push(tone);
    if (refTones.length >= 5) break;
  }

  const isBgCandidate = (x, y) => {
    const i = idx(x, y);
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
    if (maxc - minc > 10) return false; // chromatic -> character art
    const avg = (r + g + b) / 3;
    return refTones.some(t => Math.abs(avg - t) <= tol);
  };

  // 2) flood fill from border through background-candidate pixels only
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

  // 3) apply + soften edges
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

  // 4) smooth the alpha channel (box blur, radius 2) — some source art faked a translucent
  // aura/glow via dithering (alternating checker-gray + color pixels). Step 3 strips the gray
  // half, leaving a speckled hole pattern in the color half; blurring alpha turns that back
  // into a soft gradient instead of static noise. Fully opaque/transparent regions are
  // unaffected since their neighborhood is uniform.
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

  // 5) drop stray opaque "islands" not connected to the character. The border-tone flood fill
  // in step 2 only knows the checker tones sampled from the border ring, so an interior patch
  // of checkerboard using different tones (not touching the border) survives as an isolated
  // opaque blob. The character itself is always one large connected silhouette, so keep only
  // the single biggest opaque connected component and erase everything else.
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

  await img.write(outputPath);
  return refTones;
}

const names = [
  '루나리아','이그니스','실바나','녹티스','피로','네레이','솔레아','아스트라','코멧',
  '모스','마리나','브램','스파크','듀','리프','글림','애쉬','버블','클로버','더스크'
];
const imagesDir = path.resolve(__dirname, '..', 'assets', 'images');

async function main() {
  const [, , mode, a, b] = process.argv;
  if (mode === 'one') {
    const tones = await removeBg(a, b);
    console.log('OK', a, '->', b, 'tones=', tones);
    return;
  }
  for (const name of names) {
    const p = path.join(imagesDir, `${name}SD.png`);
    try {
      const tones = await removeBg(p, p);
      console.log('OK', name, 'tones=', tones);
    } catch (e) {
      console.error('FAIL', name, e.message);
    }
  }
}
main();
