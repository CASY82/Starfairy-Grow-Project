const { Jimp } = require('jimp');
async function main() {
  const [, , input] = process.argv;
  const img = await Jimp.read(input);
  const { width, height, data } = img.bitmap;
  const sample = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i+1], data[i+2], data[i+3]];
  };
  // sample along a horizontal line through the middle-lower area where the aura circle is visible
  for (let y = 150; y <= 230; y += 20) {
    let row = [];
    for (let x = 40; x <= 120; x += 8) {
      row.push(sample(x,y).join(','));
    }
    console.log(`y=${y}:`, row.join(' | '));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
