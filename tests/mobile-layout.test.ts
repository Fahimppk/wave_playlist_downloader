import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("responsive stylesheet defines tablet/mobile and narrow-phone layouts", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /\.sidebar\.sidebar-open\s*\{transform:translateX\(0\)/);
  assert.match(css, /\.track-table-wrap\s*\{[^}]*overflow-x:auto/s);
});
