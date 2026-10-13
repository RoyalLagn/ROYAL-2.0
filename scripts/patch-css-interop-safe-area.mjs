import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(
  dirname(fileURLToPath(import.meta.url)),
  "../node_modules/react-native-css-interop/dist/runtime/components.js",
);

const source = readFileSync(file, "utf8");
const next = source.replace(
  'cssInterop(react_native_1.SafeAreaView, { className: "style" });\n',
  "",
);

if (next !== source) writeFileSync(file, next);
