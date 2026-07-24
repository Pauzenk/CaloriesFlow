import sharp from "sharp";

// Screenshot is 1280x720
// Logo circle is at approx x=57, y=164, diameter ~42px in the screenshot
// We crop a generous area around it and resize

const input = "screenshots/app-logo-capture.jpg";

// Crop just the logo circle area with some padding
// Coordinates from the screenshot (1280x720)
const cropX = 50, cropY = 158, cropW = 56, cropH = 56;

const logoBuffer = await sharp(input)
  .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
  .toBuffer();

// Save at different sizes
await sharp(logoBuffer).resize(32, 32).png().toFile("client/public/favicon.png");
await sharp(logoBuffer).resize(192, 192).png().toFile("client/public/logo.png");
await sharp(logoBuffer).resize(512, 512).png().toFile("client/public/favicon-512.png");

console.log("Done — favicon files written from app screenshot.");
