import * as fs from "fs";

const content = fs.readFileSync("d:/ARUN_UDAYAN_WEB_DEVELOPMENT/boutique_frontend-hari/boutique_frontend-main/src/cart/Cartpage.tsx", "utf-8");
const lines = content.split("\n");
lines.forEach((line, index) => {
  if (line.toLowerCase().includes("price") || line.toLowerCase().includes("discount")) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
