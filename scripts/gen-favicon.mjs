import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";

// Read SVG — sharp renders it as crisp vector at any size
const svg = readFileSync("client/public/favicon.svg");

async function render(size, outPath) {
  await sharp(svg)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`Written ${outPath} (${size}x${size})`);
}

await render(32,  "client/public/favicon.png");
await render(192, "client/public/logo.png");
await render(512, "client/public/favicon-512.png");
console.log("Done.");
