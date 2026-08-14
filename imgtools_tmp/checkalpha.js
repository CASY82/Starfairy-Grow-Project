const { Jimp } = require('jimp');
async function main() {
  const [, , input, output] = process.argv;
  const img = await Jimp.read(input);
  const bg = new Jimp({ width: img.bitmap.width, height: img.bitmap.height, color: 0x1a1030ff });
  bg.composite(img, 0, 0);
  await bg.write(output);
}
main().catch(e => { console.error(e); process.exit(1); });
