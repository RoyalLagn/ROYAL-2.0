import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";

const [sourcePath, outputDirectory, requestedNames] = process.argv.slice(2);
if (!sourcePath || !outputDirectory) {
  throw new Error("Usage: node scripts/crop-category-icon-sheet.mjs <sheet.png> <output-directory>");
}

const defaultNames = [
  "venues",
  "caterers",
  "photographers",
  "decorators",
  "djs",
  "makeup-artists",
  "mehndi-artists",
  "bridal-wear",
  "groom-wear",
];
const names = requestedNames ? requestedNames.split(",").filter(Boolean) : defaultNames;
if (names.length > 9) throw new Error("A 3x3 sheet supports at most nine icon names.");

const source = PNG.sync.read(await readFile(sourcePath));
const cellWidth = Math.floor(source.width / 3);
const cellHeight = Math.floor(source.height / 3);
await mkdir(outputDirectory, { recursive: true });

for (let index = 0; index < names.length; index += 1) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const tile = new PNG({ width: cellWidth, height: cellHeight });
  PNG.bitblt(
    source,
    tile,
    column * cellWidth,
    row * cellHeight,
    cellWidth,
    cellHeight,
    0,
    0,
  );
  await writeFile(join(outputDirectory, `${names[index]}.png`), PNG.sync.write(tile));
}

console.log(`Saved ${names.length} icons to ${dirname(join(outputDirectory, names[0]))}`);
