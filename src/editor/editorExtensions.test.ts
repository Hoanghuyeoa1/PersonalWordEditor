import test from "node:test";
import assert from "node:assert/strict";
import { getEditorExtensions } from "./editorExtensions.ts";

test("Editor Extensions: returns configured StarterKit with required extensions", () => {
  const extensions = getEditorExtensions();
  assert.ok(Array.isArray(extensions));
  assert.ok(extensions.length > 0);

  // StarterKit extension check
  const starterKit = extensions[0];
  assert.equal(starterKit.name, "starterKit");
  assert.deepEqual(starterKit.options.heading?.levels, [1, 2, 3]);

  // Formatting extensions check
  const extensionNames = extensions.map((e) => e.name);
  assert.ok(extensionNames.includes("textStyle"));
  assert.ok(extensionNames.includes("fontFamily"));
  assert.ok(extensionNames.includes("fontSize"));
  assert.ok(extensionNames.includes("color"));
  assert.ok(extensionNames.includes("highlight"));
});
