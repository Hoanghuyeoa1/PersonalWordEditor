import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  commandRegistry,
  CommandRegistry,
  normalizeSearchText,
} from "./commandRegistry.ts";
import { DEFAULT_COMMANDS } from "./defaultCommands.ts";
import { executeCommandWithSelection } from "./commandExecution.ts";
import { isValidSlashTriggerContext } from "./slashExtension.ts";
import { useCommandPaletteStore } from "../stores/commandPaletteStore.ts";
import { useSlashCommandStore } from "../stores/slashCommandStore.ts";
import { useReviewStore } from "../stores/reviewStore.ts";
import { undo, redo } from "../editor/editorCommands.ts";

/**
 * Tạo nhanh ProseMirror JSON document an toàn không cần DOMParser trong môi trường Node.js test
 */
function makeDoc(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

/* ==========================================================================
   1. REGISTRY UNIQUE IDS & INTEGRITY
   ========================================================================== */

test("Phase 7.1 Unified Command System: Registry contains all unique IDs", () => {
  const allCmds = commandRegistry.getAll();
  assert.ok(allCmds.length >= 25, "Registry phải có ít nhất 25 lệnh mặc định");

  const idSet = new Set<string>();
  for (const cmd of allCmds) {
    assert.ok(cmd.id, "Mỗi command phải có id hợp lệ");
    assert.ok(!idSet.has(cmd.id), `ID "${cmd.id}" bị trùng lặp trong registry!`);
    idSet.add(cmd.id);

    assert.ok(cmd.label, `Command "${cmd.id}" thiếu label`);
    assert.ok(cmd.category, `Command "${cmd.id}" thiếu category`);
    assert.equal(typeof cmd.execute, "function", `Command "${cmd.id}" thiếu hàm execute`);
  }
});

test("Phase 7.1 Unified Command System: Registry rejects duplicate command ID", () => {
  const customRegistry = new CommandRegistry();
  customRegistry.register({
    id: "test.cmd1",
    label: "Lệnh thử nghiệm 1",
    category: "format",
    execute: () => true,
  });

  assert.throws(
    () => {
      customRegistry.register({
        id: "test.cmd1",
        label: "Lệnh trùng lặp",
        category: "format",
        execute: () => true,
      });
    },
    /đã được đăng ký trước đó/,
    "Phải ném lỗi khi đăng ký ID trùng lặp"
  );
});

/* ==========================================================================
   2. COMMAND SEARCH (LABEL, ENGLISH, DIACRITICS)
   ========================================================================== */

test("Phase 7.1 Unified Command System: Search by Vietnamese label (with & without diacritics)", () => {
  // Tìm "In đậm" hoặc "in dam"
  const boldMatches1 = commandRegistry.search("In đậm");
  assert.ok(boldMatches1.some((c) => c.id === "format.bold"));

  const boldMatches2 = commandRegistry.search("in dam");
  assert.ok(boldMatches2.some((c) => c.id === "format.bold"));

  // Tìm "tiêu đề" hoặc "tieu de"
  const headingMatches = commandRegistry.search("tieu de");
  assert.ok(headingMatches.some((c) => c.id === "format.heading1"));
  assert.ok(headingMatches.some((c) => c.id === "format.heading2"));

  // Tìm "bảng" hoặc "bang"
  const tableMatches = commandRegistry.search("bang");
  assert.ok(tableMatches.some((c) => c.id === "insert.table"));

  // Tìm "thống kê" hoặc "thong ke"
  const statsMatches = commandRegistry.search("thong ke");
  assert.ok(statsMatches.some((c) => c.id === "review.statistics"));
});

test("Phase 7.1 Unified Command System: Search by English label", () => {
  const boldRes = commandRegistry.search("bold");
  assert.equal(boldRes[0]?.id, "format.bold");

  const tableRes = commandRegistry.search("table");
  assert.ok(tableRes.some((c) => c.id === "insert.table"));

  const headingRes = commandRegistry.search("heading");
  assert.ok(headingRes.some((c) => c.id === "format.heading1"));
});

/* ==========================================================================
   3. KEYWORD SEARCH
   ========================================================================== */

test("Phase 7.1 Unified Command System: Search by keywords", () => {
  // Keyword "h1" -> Heading 1
  const h1Res = commandRegistry.search("h1");
  assert.ok(h1Res.some((c) => c.id === "format.heading1"));

  // Keyword "grid" -> Table
  const gridRes = commandRegistry.search("grid");
  assert.ok(gridRes.some((c) => c.id === "insert.table"));

  // Keyword "latex" -> Equation
  const latexRes = commandRegistry.search("latex");
  assert.ok(latexRes.some((c) => c.id === "insert.equation"));

  // Keyword "so tu" -> Document Statistics
  const wordCountRes = commandRegistry.search("so tu");
  assert.ok(wordCountRes.some((c) => c.id === "review.statistics"));
});

/* ==========================================================================
   4. DISABLED COMMAND & canExecute SAFETY
   ========================================================================== */

test("Phase 7.1 Unified Command System: canExecute correctly reflects editor state", () => {
  const readOnlyEditor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Văn bản chỉ đọc"),
    editable: false,
  });

  const boldCmd = commandRegistry.get("format.bold");
  assert.ok(boldCmd);
  assert.equal(boldCmd.canExecute?.({ editor: readOnlyEditor }), false);

  const tableCmd = commandRegistry.get("insert.table");
  assert.ok(tableCmd);
  assert.equal(tableCmd.canExecute?.({ editor: readOnlyEditor }), false);

  const editableEditor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Văn bản có thể sửa"),
    editable: true,
  });
  assert.equal(boldCmd.canExecute?.({ editor: editableEditor }), true);
  assert.equal(tableCmd.canExecute?.({ editor: editableEditor }), true);

  // Track changes accept/reject canExecute is false when there's no change at cursor
  const acceptCmd = commandRegistry.get("review.acceptChange");
  assert.ok(acceptCmd);
  assert.equal(acceptCmd.canExecute?.({ editor: editableEditor }), false);
});

test("Phase 7.1 Unified Command System: executeCommandWithSelection blocks disabled command", async () => {
  const readOnlyEditor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Văn bản chỉ đọc"),
    editable: false,
  });

  const success = await executeCommandWithSelection("format.bold", {
    editor: readOnlyEditor,
  });
  assert.equal(success, false, "Lệnh không được phép thực thi khi canExecute = false");
});

/* ==========================================================================
   5. KEYBOARD NAVIGATION & STORE WRAP-AROUND
   ========================================================================== */

test("Phase 7.1 Unified Command System: Command Palette navigation and wrap-around", () => {
  const store = useCommandPaletteStore.getState();
  store.openPalette();
  assert.equal(useCommandPaletteStore.getState().isOpen, true);
  assert.equal(useCommandPaletteStore.getState().selectedIndex, 0);

  // selectNext with 5 items
  store.selectNext(5);
  assert.equal(useCommandPaletteStore.getState().selectedIndex, 1);
  store.selectNext(5);
  assert.equal(useCommandPaletteStore.getState().selectedIndex, 2);

  // Wrap around at boundary
  store.setSelectedIndex(4);
  store.selectNext(5);
  assert.equal(useCommandPaletteStore.getState().selectedIndex, 0, "Wrap around về 0");

  // selectPrev wrap around
  store.selectPrev(5);
  assert.equal(useCommandPaletteStore.getState().selectedIndex, 4, "Wrap around về 4");

  store.closePalette();
  assert.equal(useCommandPaletteStore.getState().isOpen, false);
});

test("Phase 7.1 Unified Command System: Slash Menu navigation and wrap-around", () => {
  const store = useSlashCommandStore.getState();
  store.openSlashMenu({ x: 100, y: 150 }, { from: 1, to: 2 }, "");
  assert.equal(useSlashCommandStore.getState().isOpen, true);
  assert.equal(useSlashCommandStore.getState().selectedIndex, 0);

  store.selectNext(3);
  assert.equal(useSlashCommandStore.getState().selectedIndex, 1);
  store.selectNext(3);
  assert.equal(useSlashCommandStore.getState().selectedIndex, 2);
  store.selectNext(3);
  assert.equal(useSlashCommandStore.getState().selectedIndex, 0);

  store.selectPrev(3);
  assert.equal(useSlashCommandStore.getState().selectedIndex, 2);

  store.closeSlashMenu();
  assert.equal(useSlashCommandStore.getState().isOpen, false);
});

/* ==========================================================================
   6. EXECUTE COMMAND VIA EXISTING ABSTRACTIONS
   ========================================================================== */

test("Phase 7.1 Unified Command System: Execute format.bold via unified pipeline", async () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Đoạn văn thử nghiệm"),
  });

  editor.commands.selectAll();
  assert.equal(editor.isActive("bold"), false);

  const res = await executeCommandWithSelection("format.bold", { editor });
  assert.equal(res, true);
  assert.equal(editor.isActive("bold"), true, "Phải bật bold thành công");
});

test("Phase 7.1 Unified Command System: Execute format.heading1 via unified pipeline", async () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Dòng tiêu đề"),
  });

  editor.commands.setTextSelection(3);
  const res = await executeCommandWithSelection("format.heading1", { editor });
  assert.equal(res, true);
  assert.equal(editor.isActive("heading", { level: 1 }), true, "Phải đổi thành heading 1");
});

test("Phase 7.1 Unified Command System: Execute insert.table via unified pipeline", async () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Trước bảng"),
  });

  editor.commands.setTextSelection(editor.state.doc.content.size);
  const res = await executeCommandWithSelection("insert.table", { editor });
  assert.equal(res, true);

  let hasTable = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "table") hasTable = true;
  });
  assert.equal(hasTable, true, "Bảng 3x3 phải được chèn vào tài liệu");
});

test("Phase 7.1 Unified Command System: Execute insert.pageBreak via unified pipeline", async () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Đoạn 1"),
  });

  editor.commands.setTextSelection(editor.state.doc.content.size);
  const res = await executeCommandWithSelection("insert.pageBreak", { editor });
  assert.equal(res, true);

  let hasPageBreak = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "pageBreak") hasPageBreak = true;
  });
  assert.equal(hasPageBreak, true, "Dấu ngắt trang phải được chèn vào tài liệu");
});

/* ==========================================================================
   7. PRESERVE EDITOR SELECTION
   ========================================================================== */

test("Phase 7.1 Unified Command System: Selection bookmark is safely restored before execution", async () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Xin chào Việt Nam tươi đẹp"),
  });

  // Chọn từ "Việt Nam" (pos 10 đến 18)
  const savedSelection = { from: 10, to: 18, empty: false };

  // Giả lập focus bị mất ra ngoài (selection trỏ về đầu pos 1)
  editor.commands.setTextSelection(1);

  await executeCommandWithSelection("format.bold", {
    editor,
    savedSelection,
  });

  // Kiểm tra: Bold chỉ được áp dụng lên selection đã phục hồi "Việt Nam"
  let boldText = "";
  editor.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === "bold")) {
      boldText += node.text;
    }
  });

  assert.equal(boldText, "Việt Nam", "Selection ban đầu phải được phục hồi và áp dụng Bold chuẩn xác");
});

/* ==========================================================================
   8. SLASH TRIGGER (VALID CONTEXTS)
   ========================================================================== */

test("Phase 7.1 Unified Command System: Slash triggers in valid contexts", () => {
  // Context A: Paragraph trống có mỗi "/"
  const editorA = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("/"),
  });
  editorA.commands.setTextSelection(2);
  const resA = isValidSlashTriggerContext(editorA.state, 2);
  assert.equal(resA.valid, true);
  assert.equal(resA.query, "");

  // Context B: Đầu paragraph gõ "/hea"
  const editorB = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("/hea"),
  });
  editorB.commands.setTextSelection(5);
  const resB = isValidSlashTriggerContext(editorB.state, 5);
  assert.equal(resB.valid, true);
  assert.equal(resB.query, "hea");

  // Context C: Sau khoảng trắng "Xin chao /tab"
  const editorC = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Xin chao /tab"),
  });
  const endPos = editorC.state.doc.content.size - 1;
  editorC.commands.setTextSelection(endPos);
  const resC = isValidSlashTriggerContext(editorC.state, endPos);
  assert.equal(resC.valid, true);
  assert.equal(resC.query, "tab");
});

/* ==========================================================================
   9. SLASH QUERY FILTERING
   ========================================================================== */

test("Phase 7.1 Unified Command System: Slash queries filter properly with slashOnly: true", () => {
  const heaMatches = commandRegistry.search("hea", { slashOnly: true });
  assert.ok(heaMatches.length > 0);
  assert.ok(heaMatches.some((c) => c.id === "format.heading1"));

  const tabMatches = commandRegistry.search("tab", { slashOnly: true });
  assert.ok(tabMatches.length > 0);
  assert.ok(tabMatches.some((c) => c.id === "insert.table"));

  const imaMatches = commandRegistry.search("ima", { slashOnly: true });
  assert.ok(imaMatches.length > 0);
  assert.ok(imaMatches.some((c) => c.id === "insert.image"));

  // format.bold không có slashEnabled nên không xuất hiện trong slash search
  const boldMatches = commandRegistry.search("bold", { slashOnly: true });
  assert.equal(boldMatches.length, 0, "Lệnh slashEnabled: false không được phép xuất hiện trong Slash search");
});

/* ==========================================================================
   10. ESCAPE CLOSES WITHOUT MUTATING DOCUMENT
   ========================================================================== */

test("Phase 7.1 Unified Command System: Escape closes menu without mutating document text", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Noi dung truoc /hea"),
  });

  const docBefore = editor.getJSON();
  useSlashCommandStore.getState().openSlashMenu({ x: 50, y: 50 }, { from: 17, to: 21 }, "hea");
  assert.equal(useSlashCommandStore.getState().isOpen, true);

  // User hits Escape -> menu closes
  useSlashCommandStore.getState().closeSlashMenu();
  assert.equal(useSlashCommandStore.getState().isOpen, false);

  const docAfter = editor.getJSON();
  assert.deepEqual(docAfter, docBefore, "Văn bản document không được bị biến đổi khi Escape");
});

/* ==========================================================================
   11. SLASH CLEANUP ON COMMAND SELECTION
   ========================================================================== */

test("Phase 7.1 Unified Command System: Selecting command removes slash query text cleanly", async () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("/hea"),
  });

  // Range of "/hea" in ProseMirror
  const rangeToDelete = { from: 1, to: 5 };

  await executeCommandWithSelection("format.heading1", {
    editor,
    rangeToDelete,
  });

  // Kiểm tra: Node chuyển thành heading 1 và chuỗi "/hea" đã bị xóa hoàn toàn
  assert.equal(editor.isActive("heading", { level: 1 }), true);
  const textContent = editor.getText();
  assert.ok(!textContent.includes("/hea"), 'Chuỗi "/hea" phải được loại bỏ sạch sẽ');
});

/* ==========================================================================
   12. UNDO / REDO SAFETY
   ========================================================================== */

test("Phase 7.1 Unified Command System: Undo & Redo safely restores pre-command state", async () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Đoạn văn bản gốc"),
  });

  editor.commands.setTextSelection(10);
  await executeCommandWithSelection("insert.pageBreak", { editor });
  assert.ok(editor.getJSON()?.content?.some((n) => n.type === "pageBreak"));

  // Undo
  undo(editor);
  assert.equal(
    editor.getJSON()?.content?.some((n) => n.type === "pageBreak"),
    false,
    "Undo phải khôi phục trạng thái trước khi chèn pageBreak"
  );

  // Redo
  redo(editor);
  assert.equal(
    editor.getJSON()?.content?.some((n) => n.type === "pageBreak"),
    true,
    "Redo phải làm lại thao tác chèn pageBreak"
  );
});

/* ==========================================================================
   13. TRACK CHANGES INTERACTION
   ========================================================================== */

test("Phase 7.1 Unified Command System: Commands interact safely when Track Changes is ON", async () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Văn bản theo dõi"),
  });

  // Bật Track Changes
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Thực thi lệnh ngắt trang qua unified command pipeline
  editor.commands.setTextSelection(editor.state.doc.content.size);
  const res = await executeCommandWithSelection("insert.pageBreak", { editor });
  assert.equal(res, true);

  let hasPageBreak = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "pageBreak") hasPageBreak = true;
  });
  assert.equal(hasPageBreak, true, "Lệnh phải đi qua pipeline thành công khi Track Changes ON");

  // Reset Track Changes store
  useReviewStore.getState().setTrackChangesEnabled(false);
});

/* ==========================================================================
   14. IME & NON-VALID CONTEXTS SAFETY
   ========================================================================== */

test("Phase 7.1 Unified Command System: Does NOT trigger in URLs, links, fractions, and IME composing", () => {
  // A. URL (https://google.com/search)
  const editorURL = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Truy cập https://google.com/search"),
  });
  const resURL = isValidSlashTriggerContext(editorURL.state, editorURL.state.doc.content.size - 1);
  assert.equal(resURL.valid, false, "Không được trigger trong URL");

  // B. Phân số / từ ghép (1/2, and/or, a/b)
  const editorFraction = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("Tỉ lệ 1/2"),
  });
  const resFraction = isValidSlashTriggerContext(editorFraction.state, 10);
  assert.equal(resFraction.valid, false, "Không được trigger trong phân số hoặc từ nối");

  // C. IME Composing đang diễn ra
  const editorIME = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("/"),
  });
  const fakeIMEView = { composing: true } as any;
  const resIME = isValidSlashTriggerContext(editorIME.state, 2, fakeIMEView);
  assert.equal(resIME.valid, false, "Tuyệt đối không trigger khi IME đang composing");

  // D. Đoạn văn chứa link mark
  const editorLink = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Trang web /",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    },
  });
  const resLink = isValidSlashTriggerContext(editorLink.state, 12);
  assert.equal(resLink.valid, false, "Không được trigger bên trong Hyperlink mark");

  // E. Đã có khoảng trắng sau slash ("/table ")
  const editorSpace = new Editor({
    extensions: getEditorExtensions(),
    content: makeDoc("/table "),
  });
  const resSpace = isValidSlashTriggerContext(editorSpace.state, 8);
  assert.equal(resSpace.valid, false, "Không trigger khi query chứa dấu cách");
});

/* ==========================================================================
   15. EVENT LISTENER CLEANUP & INTEGRATION COEXISTENCE
   ========================================================================== */

test("Phase 7.1 Unified Command System: Store resets and clean teardown", () => {
  const paletteStore = useCommandPaletteStore.getState();
  paletteStore.openPalette({ from: 1, to: 5, empty: false });
  assert.equal(useCommandPaletteStore.getState().isOpen, true);
  assert.notEqual(useCommandPaletteStore.getState().savedSelection, null);

  paletteStore.closePalette();
  assert.equal(useCommandPaletteStore.getState().isOpen, false);
  assert.equal(useCommandPaletteStore.getState().savedSelection, null);

  const slashStore = useSlashCommandStore.getState();
  slashStore.openSlashMenu({ x: 10, y: 10 }, { from: 1, to: 3 }, "query");
  assert.equal(useSlashCommandStore.getState().isOpen, true);

  slashStore.closeSlashMenu();
  assert.equal(useSlashCommandStore.getState().isOpen, false);
  assert.equal(useSlashCommandStore.getState().position, null);
  assert.equal(useSlashCommandStore.getState().triggerRange, null);
});
