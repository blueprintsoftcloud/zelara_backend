import * as fs from "fs";

const content = fs.readFileSync("d:/ARUN_UDAYAN_WEB_DEVELOPMENT/boutique_frontend-hari/boutique_frontend-main/src/components/HeroSection.tsx", "utf-8");
const lines = content.split("\n");
lines.forEach((line, index) => {
  const l = line.toLowerCase();
  if (l.includes("template") || l.includes("height") || l.includes("min-h-") || l.includes("h-") && (l.includes("screen") || l.includes("px") || l.includes("vh"))) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
