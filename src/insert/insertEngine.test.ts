import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  INSERT_ITEMS_REGISTRY,
  getInsertItemDescriptor,
  getInsertItemsByGroup,
  getActiveInsertItems,
  getPlannedInsertItems,
  isInsertItemActive,
} from "./services/insertRegistry.ts";
import {
  canInsertItem,
  isItemSupportedInSchema,
  executeInsertPageBreak,
  executeInsertSectionBreak,
  executeInsertTable,
  executeInsertImage,
  executeInsertShape,
  executeInsertTextBox,
  executeInsertLink,
  executeInsertHorizontalRule,
  executeInsertSymbol,
  executeInsertEquation,
  dispatchInsertCommand,
} from "./commands/insertCommands.ts";
import type { InsertItemType } from "./types/insertTypes.ts";

function createTestDoc(text = "Văn bản kiểm thử") {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

test("Phase 3.1 - Registry: contains all planned and active items across 7 groups", () => {
  assert.ok(INSERT_ITEMS_REGISTRY.length >= 13, "Registry must contain at least 13 item descriptors");

  const groups = new Set(INSERT_ITEMS_REGISTRY.map((item) => item.group));
  assert.ok(groups.has("pages"), "Should have pages group");
  assert.ok(groups.has("tables"), "Should have tables group");
  assert.ok(groups.has("illustrations"), "Should have illustrations group");
  assert.ok(groups.has("links"), "Should have links group");
  assert.ok(groups.has("headerFooter"), "Should have headerFooter group");
  assert.ok(groups.has("text"), "Should have text group");
  assert.ok(groups.has("symbols"), "Should have symbols group");
});

test("Phase 3.1 - Registry: retrieves items by id and group correctly", () => {
  const tableDesc = getInsertItemDescriptor("table");
  assert.ok(tableDesc, "Table descriptor must exist");
  assert.equal(tableDesc?.nameEn, "Table");
  assert.equal(tableDesc?.status, "active");
  assert.equal(tableDesc?.group, "tables");

  const illustrations = getInsertItemsByGroup("illustrations");
  assert.equal(illustrations.length, 2, "Illustrations should have 2 items (Pictures, Shapes)");
  const ids = illustrations.map((i) => i.id);
  assert.ok(ids.includes("image"));
  assert.ok(ids.includes("shape"));

  const symbols = getInsertItemsByGroup("symbols");
  assert.equal(symbols.length, 2, "Symbols should have 2 items (Equation, Symbol)");
});

test("Phase 3.1 - Registry: active vs planned status reflects Phase 2 & 3 roadmap", () => {
  const activeItems = getActiveInsertItems().map((i) => i.id);
  assert.ok(activeItems.includes("pageBreak"), "pageBreak should be active");
  assert.ok(activeItems.includes("sectionBreak"), "sectionBreak should be active");
  assert.ok(activeItems.includes("header"), "header should be active");
  assert.ok(activeItems.includes("footer"), "footer should be active");
  assert.ok(activeItems.includes("pageNumber"), "pageNumber should be active");
  assert.ok(activeItems.includes("link"), "link should be active in Phase 3.2");
  assert.ok(activeItems.includes("horizontalRule"), "horizontalRule should be active in Phase 3.2");
  assert.ok(activeItems.includes("symbol"), "symbol should be active in Phase 3.2");
  assert.ok(activeItems.includes("table"), "table should be active in Phase 3.3");
  assert.ok(activeItems.includes("textbox"), "textbox should be active in Phase 3.7");
  assert.ok(activeItems.includes("shape"), "shape should be active in Phase 3.8");
  assert.ok(activeItems.includes("equation"), "equation should be active in Phase 3.8");
  assert.ok(activeItems.includes("image"), "image should be active in Phase 3.5 & 3.9");

  assert.equal(isInsertItemActive("pageBreak"), true);
  assert.equal(isInsertItemActive("link"), true);
  assert.equal(isInsertItemActive("horizontalRule"), true);
  assert.equal(isInsertItemActive("symbol"), true);
  assert.equal(isInsertItemActive("table"), true);
  assert.equal(isInsertItemActive("textbox"), true);
  assert.equal(isInsertItemActive("shape"), true);
  assert.equal(isInsertItemActive("equation"), true);
  assert.equal(isInsertItemActive("image"), true);
});

test("Phase 3.1 - Command Architecture: null editor safety", () => {
  assert.equal(canInsertItem(null, "pageBreak"), false);
  assert.equal(canInsertItem(null, "table"), false);

  const resPageBreak = executeInsertPageBreak(null);
  assert.equal(resPageBreak.success, false);
  assert.equal(resPageBreak.itemType, "pageBreak");

  const resSectionBreak = executeInsertSectionBreak(null);
  assert.equal(resSectionBreak.success, false);
  assert.equal(resSectionBreak.itemType, "sectionBreak");

  const resTable = executeInsertTable(null);
  assert.equal(resTable.success, false);
  assert.equal(resTable.itemType, "table");

  const resDispatch = dispatchInsertCommand(null, "table");
  assert.equal(resDispatch.success, false);
  assert.equal(resDispatch.itemType, "table");
});

test("Phase 3.1 - Schema Audit: distinguishes supported vs upcoming nodes in live editor", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: createTestDoc(),
  });

  // Đã hỗ trợ qua Phase 2 & 3
  assert.equal(isItemSupportedInSchema(editor, "pageBreak"), true);
  assert.equal(isItemSupportedInSchema(editor, "sectionBreak"), true);
  assert.equal(isItemSupportedInSchema(editor, "table"), true);
  assert.equal(isItemSupportedInSchema(editor, "textbox"), true);
  assert.equal(isItemSupportedInSchema(editor, "shape"), true);
  assert.equal(isItemSupportedInSchema(editor, "equation"), true);
  assert.equal(isItemSupportedInSchema(editor, "image"), true);
  assert.equal(canInsertItem(editor, "pageBreak"), true);
  assert.equal(canInsertItem(editor, "sectionBreak"), true);
  assert.equal(canInsertItem(editor, "table"), true);
  assert.equal(canInsertItem(editor, "textbox"), true);
  assert.equal(canInsertItem(editor, "shape"), true);
  assert.equal(canInsertItem(editor, "equation"), true);
  assert.equal(canInsertItem(editor, "image"), true);

  editor.destroy();
});

test("Phase 3.1 - Command Execution: active commands execute properly via command layer", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: createTestDoc("Đoạn văn 1"),
  });

  // Thực thi lệnh chèn Page Break qua command layer
  const pbResult = executeInsertPageBreak(editor);
  assert.equal(pbResult.success, true);
  assert.equal(pbResult.itemType, "pageBreak");

  const json = editor.getJSON();
  const nodeTypes = json.content?.map((n) => n.type) || [];
  assert.ok(nodeTypes.includes("pageBreak"), "Editor JSON must contain pageBreak node");

  // Thực thi lệnh chèn Section Break qua dispatch
  const sbResult = dispatchInsertCommand(editor, "sectionBreak");
  assert.equal(sbResult.success, true);
  assert.equal(sbResult.itemType, "sectionBreak");

  const updatedNodeTypes = editor.getJSON().content?.map((n) => n.type) || [];
  assert.ok(updatedNodeTypes.includes("sectionBreak"), "Editor JSON must contain sectionBreak node");

  editor.destroy();
});

test("Phase 3.1 - Command Validation: invalid image without src returns polite rejection without altering editor AST", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: createTestDoc("Nội dung ban đầu"),
  });

  const jsonBefore = JSON.stringify(editor.getJSON());

  // Thử gọi lệnh Image mà không có src
  const imgRes = executeInsertImage(editor, { src: "" });
  assert.equal(imgRes.success, false);
  assert.ok(imgRes.message?.includes("nguồn"));

  // Xác minh tuyệt đối AST không bị thay đổi hoặc corrupt
  const jsonAfter = JSON.stringify(editor.getJSON());
  assert.equal(jsonBefore, jsonAfter, "Editor AST must remain 100% untouched after rejected command attempts");

  editor.destroy();
});

test("Phase 3.1 - Symbol Command: inserts Unicode symbol cleanly into text", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: createTestDoc("Bản quyền "),
  });

  editor.commands.focus("end");
  const symResult = executeInsertSymbol(editor, { symbol: "©" });
  assert.equal(symResult.success, true);
  assert.ok(editor.getText().includes("©"), "Text must contain the inserted symbol");

  editor.destroy();
});

test("Phase 3.1 - Dispatcher: routes commands deterministically and handles unknown commands", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: createTestDoc("Kiểm tra Dispatcher"),
  });

  const hfRes = dispatchInsertCommand(editor, "header");
  assert.equal(hfRes.success, true);

  const unknownRes = dispatchInsertCommand(editor, "nonExistent" as unknown as InsertItemType);
  assert.equal(unknownRes.success, false);
  assert.ok(unknownRes.message?.includes("không xác định"));

  editor.destroy();
});
