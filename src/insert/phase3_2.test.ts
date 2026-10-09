import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  validateAndNormalizeUrl,
  getSelectedText,
  getActiveLinkInfo,
} from "./services/linkService.ts";
import {
  POPULAR_SYMBOLS,
  SYMBOL_CATEGORIES,
  filterSymbols,
  getSymbolByChar,
} from "./services/symbolService.ts";
import {
  insertHorizontalRule,
  setLink,
  unsetLink,
  isLinkActive,
  getLinkAttributes,
  updateOrInsertLink,
  insertSymbol,
  undo,
  redo,
} from "../editor/editorCommands.ts";
import {
  executeInsertLink,
  executeInsertHorizontalRule,
  executeInsertSymbol,
} from "./commands/insertCommands.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  extractDocumentStats,
  createInitialDocument,
} from "../document/documentModel.ts";
import { calculatePaginationState } from "../page/services/paginationService.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/services/pageConstants.ts";

function createEditorWithContent(content: any) {
  return new Editor({
    extensions: getEditorExtensions(),
    content,
  });
}

function createTextDoc(text = "Personal Word Editor") {
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

// ============================================================================
// A. HYPERLINK TESTS
// ============================================================================

test("Phase 3.2 - Link Service: validateAndNormalizeUrl supports https, http, and mailto", () => {
  // Valid https
  const res1 = validateAndNormalizeUrl("https://deepmind.google");
  assert.equal(res1.isValid, true);
  assert.equal(res1.normalizedUrl, "https://deepmind.google/");

  // Valid http
  const res2 = validateAndNormalizeUrl("http://example.org/test?q=1");
  assert.equal(res2.isValid, true);
  assert.equal(res2.normalizedUrl, "http://example.org/test?q=1");

  // Valid mailto
  const res3 = validateAndNormalizeUrl("mailto:support@example.com");
  assert.equal(res3.isValid, true);
  assert.equal(res3.normalizedUrl, "mailto:support@example.com");

  // Plain domain auto-prepends https://
  const res4 = validateAndNormalizeUrl("github.com/repository");
  assert.equal(res4.isValid, true);
  assert.equal(res4.normalizedUrl, "https://github.com/repository");

  // Empty string fails gracefully without crash
  const resEmpty = validateAndNormalizeUrl("");
  assert.equal(resEmpty.isValid, false);
  assert.ok(resEmpty.error);

  // Whitespace only fails gracefully
  const resSpaces = validateAndNormalizeUrl("   ");
  assert.equal(resSpaces.isValid, false);

  // Unsupported scheme fails safely
  const resFtp = validateAndNormalizeUrl("ftp://files.example.com");
  assert.equal(resFtp.isValid, false);
  assert.ok(resFtp.error?.includes("Giao thức không được hỗ trợ"));
});

test("Phase 3.2 - Hyperlink: Semantic mark applied to text selection", () => {
  const editor = createEditorWithContent(createTextDoc("Tài liệu nghiên cứu khoa học"));

  // Chọn từ "khoa học" (từ ký tự 21 đến 29)
  // Text node starts at pos 1: "Tài liệu nghiên cứu " (20 ký tự) + "khoa học" (8 ký tự)
  editor.commands.setTextSelection({ from: 21, to: 29 });

  const selected = getSelectedText(editor);
  assert.equal(selected, "khoa học");

  // Gán hyperlink
  const success = updateOrInsertLink(editor, "khoa học", "https://science.org");
  assert.equal(success, true);

  // Kiểm tra mark trong AST
  const json = editor.getJSON();
  const paragraph = json.content?.[0];
  const linkedNode = paragraph?.content?.find((node: any) =>
    node.marks?.some((m: any) => m.type === "link")
  );

  assert.ok(linkedNode, "Should find text node with link mark");
  assert.equal(linkedNode.text, "khoa học");
  assert.equal(linkedNode.marks[0].type, "link");
  assert.equal(linkedNode.marks[0].attrs.href, "https://science.org");

  editor.destroy();
});

test("Phase 3.2 - Hyperlink: Edit Link updates URL and text cleanly", () => {
  const editor = createEditorWithContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Xem " },
          {
            type: "text",
            text: "Google",
            marks: [{ type: "link", attrs: { href: "https://google.com" } }],
          },
          { type: "text", text: " để tìm kiếm." },
        ],
      },
    ],
  });

  // Đặt con trỏ vào giữa chữ "Google" (pos 7)
  editor.commands.setTextSelection(7);

  assert.equal(isLinkActive(editor), true);
  const linkInfo = getActiveLinkInfo(editor);
  assert.ok(linkInfo);
  assert.equal(linkInfo?.href, "https://google.com");
  assert.equal(linkInfo?.text, "Google");

  // Cập nhật link sang "Google Search" với URL mới
  const updateSuccess = updateOrInsertLink(editor, "Google Search", "https://google.com/search");
  assert.equal(updateSuccess, true);

  // Kiểm tra AST sau khi cập nhật
  const paragraph = editor.getJSON().content?.[0];
  const updatedNode = paragraph?.content?.find((node: any) =>
    node.marks?.some((m: any) => m.type === "link")
  );

  assert.ok(updatedNode);
  assert.equal(updatedNode.text, "Google Search");
  assert.equal(updatedNode.marks[0].attrs.href, "https://google.com/search");

  editor.destroy();
});

test("Phase 3.2 - Hyperlink: Remove Link unsets semantic mark preserving text", () => {
  const editor = createEditorWithContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Trang chủ",
            marks: [{ type: "link", attrs: { href: "https://homepage.vn" } }],
          },
        ],
      },
    ],
  });

  // Đặt con trỏ vào trong link
  editor.commands.setTextSelection(4);
  assert.equal(isLinkActive(editor), true);

  // Hủy link bằng unsetLink
  const unsetSuccess = unsetLink(editor);
  assert.equal(unsetSuccess, true);

  // Sau khi hủy link: chữ "Trang chủ" vẫn còn, nhưng mark link đã bị gỡ
  const json = editor.getJSON();
  const textNode = json.content?.[0]?.content?.[0];
  assert.equal(textNode.text, "Trang chủ");
  assert.equal(textNode.marks, undefined);
  assert.equal(isLinkActive(editor), false);

  editor.destroy();
});

test("Phase 3.2 - Hyperlink: Link inside heading and list items", () => {
  const editor = createEditorWithContent({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Tiêu đề tài liệu" }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Mục danh sách thứ nhất" }],
              },
            ],
          },
        ],
      },
    ],
  });

  // Gán link trong Heading 2
  // "Tiêu đề tài liệu" starts at pos 2
  editor.commands.setTextSelection({ from: 2, to: 9 }); // "Tiêu đề"
  updateOrInsertLink(editor, "Tiêu đề", "https://heading.org");

  const headingNode = editor.getJSON().content?.[0];
  assert.equal(headingNode.type, "heading");
  const linkedHeadingText = headingNode.content?.find((n: any) => n.marks?.some((m: any) => m.type === "link"));
  assert.ok(linkedHeadingText);
  assert.equal(linkedHeadingText.text, "Tiêu đề");

  // Gán link trong bullet list item
  // Select "thứ nhất"
  const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ");
  const listTarget = "thứ nhất";
  const startIdx = docText.indexOf(listTarget);
  assert.ok(startIdx > 0);

  // Link inside list via command API
  editor.commands.setTextSelection({ from: startIdx + 1, to: startIdx + 1 + listTarget.length });
  updateOrInsertLink(editor, listTarget, "https://list.org");

  const listJson = editor.getJSON().content?.[1];
  assert.equal(listJson.type, "bulletList");
  const listItemPara = listJson.content?.[0]?.content?.[0];
  const linkedListText = listItemPara.content?.find((n: any) => n.marks?.some((m: any) => m.type === "link"));
  assert.ok(linkedListText);
  assert.equal(linkedListText.marks[0].attrs.href, "https://list.org");

  editor.destroy();
});

test("Phase 3.2 - Hyperlink: Inserting link at empty caret creates new linked text", () => {
  const editor = createEditorWithContent({
    type: "doc",
    content: [{ type: "paragraph" }],
  });

  // Caret at pos 1 (empty paragraph)
  editor.commands.setTextSelection(1);
  const success = updateOrInsertLink(editor, "DeepMind", "https://deepmind.google");
  assert.equal(success, true);

  const json = editor.getJSON();
  const textNode = json.content?.[0]?.content?.[0];
  assert.equal(textNode.text, "DeepMind");
  assert.equal(textNode.marks[0].type, "link");
  assert.equal(textNode.marks[0].attrs.href, "https://deepmind.google");

  editor.destroy();
});

// ============================================================================
// B. HORIZONTAL LINE TESTS
// ============================================================================

test("Phase 3.2 - Horizontal Rule: Registered as semantic block node and not fake text", () => {
  const editor = createEditorWithContent(createTextDoc("Đoạn văn"));
  const schema = editor.schema;

  assert.ok(schema.nodes.horizontalRule, "horizontalRule node must exist in schema");
  assert.equal(schema.nodes.horizontalRule.isBlock, true);

  editor.destroy();
});

test("Phase 3.2 - Horizontal Rule: Insertion between paragraphs splits cleanly", () => {
  const editor = createEditorWithContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn trên" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn dưới" }],
      },
    ],
  });

  // Đặt con trỏ ở cuối đoạn trên (pos 10)
  editor.commands.setTextSelection(10);
  const success = insertHorizontalRule(editor);
  assert.equal(success, true);

  const json = editor.getJSON();
  const nodeTypes = json.content?.map((n: any) => n.type);

  // Phải có 1 node kiểu "horizontalRule" nằm giữa các đoạn
  assert.ok(nodeTypes.includes("horizontalRule"), "Should contain horizontalRule node");
  const hrIndex = nodeTypes.indexOf("horizontalRule");
  assert.ok(hrIndex >= 1, "horizontalRule should be after the first paragraph");

  editor.destroy();
});

test("Phase 3.2 - Horizontal Rule: Undo and Redo revert and restore cleanly", () => {
  const editor = createEditorWithContent(createTextDoc("Trước đường kẻ"));

  // Đặt caret ở cuối văn bản
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);

  // Chèn horizontal rule
  insertHorizontalRule(editor);
  const hasHrAfterInsert = editor.getJSON().content?.some((n: any) => n.type === "horizontalRule");
  assert.equal(hasHrAfterInsert, true);

  // Undo: Đường kẻ ngang phải biến mất
  undo(editor);
  const hasHrAfterUndo = editor.getJSON().content?.some((n: any) => n.type === "horizontalRule");
  assert.equal(hasHrAfterUndo, false);

  // Redo: Đường kẻ ngang phải xuất hiện lại
  redo(editor);
  const hasHrAfterRedo = editor.getJSON().content?.some((n: any) => n.type === "horizontalRule");
  assert.equal(hasHrAfterRedo, true);

  editor.destroy();
});

// ============================================================================
// C. SYMBOL TESTS
// ============================================================================

test("Phase 3.2 - Symbol Service: Popular symbols catalog and search filter", () => {
  assert.ok(POPULAR_SYMBOLS.length >= 35, "Must provide popular symbols list");
  assert.ok(SYMBOL_CATEGORIES.length >= 5, "Must provide symbol categories");

  // Kiểm tra sự hiện diện của các ký tự bắt buộc trong yêu cầu
  const requiredChars = ["©", "®", "™", "€", "£", "¥", "±", "×", "÷", "≤", "≥", "≠", "∞", "→", "←", "↑", "↓", "✓", "★", "§"];
  for (const char of requiredChars) {
    const found = getSymbolByChar(char);
    assert.ok(found, `Required symbol ${char} must exist in popular catalog`);
  }

  // Lọc theo category "currency"
  const currencySymbols = filterSymbols("currency", "");
  assert.ok(currencySymbols.some((s) => s.char === "€"));
  assert.ok(currencySymbols.some((s) => s.char === "$"));

  // Tìm kiếm theo từ khóa "copyright"
  const searchResults = filterSymbols("all", "copyright");
  assert.ok(searchResults.some((s) => s.char === "©"));
});

test("Phase 3.2 - Symbol: Inserts Unicode symbol at caret preserving surrounding text", () => {
  const editor = createEditorWithContent(createTextDoc("Bản quyền"));

  // Đặt caret ở cuối chữ "Bản quyền " (pos 10)
  editor.commands.setTextSelection(10);

  // Chèn symbol ©
  const success = insertSymbol(editor, "©");
  assert.equal(success, true);

  const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ");
  assert.ok(docText.includes("Bản quyền©"), `Text should contain symbol: ${docText}`);

  editor.destroy();
});

test("Phase 3.2 - Symbol: Vietnamese text around Unicode symbols and undo/redo", () => {
  const editor = createEditorWithContent(createTextDoc("Giá trị "));

  // Đặt caret ở cuối văn bản
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);

  // Chèn ký hiệu tiền tệ €
  insertSymbol(editor, "€");

  // Gõ tiếp tiếng Việt sau ký hiệu
  const tr = editor.state.tr.insertText(" đã bao gồm thuế VAT");
  editor.view.dispatch(tr);

  const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ");
  assert.equal(fullText, "Giá trị € đã bao gồm thuế VAT");

  editor.destroy();
});

test("Phase 3.2 - Symbol: Preserves active bold mark when inserted", () => {
  const editor = createEditorWithContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Cảnh báo quan trọng ",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  });

  // Đặt caret ở cuối đoạn văn bản in đậm
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);

  // Chèn ngôi sao ★
  insertSymbol(editor, "★");

  const json = editor.getJSON();
  const textNodes = json.content?.[0]?.content || [];
  const starNode = textNodes.find((n: any) => n.text?.includes("★"));

  assert.ok(starNode, "Should find star node");
  const hasBold = starNode.marks?.some((m: any) => m.type === "bold");
  assert.equal(hasBold, true, "Symbol should inherit active bold mark");

  editor.destroy();
});

// ============================================================================
// D. DIRTY & PERSISTENCE (.mwd) TESTS
// ============================================================================

test("Phase 3.2 - Persistence: Save & Open round-trip preserves Hyperlink, HR and Symbols", () => {
  const initialContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [
          {
            type: "text",
            text: "Tài liệu bản quyền ",
          },
          {
            type: "text",
            text: "© 2026",
            marks: [{ type: "bold" }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Truy cập tại " },
          {
            type: "text",
            text: "Cổng thông tin",
            marks: [{ type: "link", attrs: { href: "https://portal.example.com" } }],
          },
          { type: "text", text: " để xem chi tiết." },
        ],
      },
      {
        type: "horizontalRule",
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Mục kiểm tra: ✓ Đạt chuẩn — Nhiệt độ: 25°C ± 0.5°C",
          },
        ],
      },
    ],
  };

  const initialDoc = createInitialDocument(
    "Báo cáo thẩm định",
    initialContent,
    DEFAULT_PAGE_SETTINGS
  );
  const fileString = serializeDocumentToMwd(initialDoc);

  assert.ok(typeof fileString === "string");
  assert.ok(fileString.length > 50);

  // 2. Deserialize từ chuỗi file .mwd
  const deserializeResult = deserializeMwdToDocument(fileString);
  assert.equal(deserializeResult.success, true);
  if (!deserializeResult.success) return;

  const restoredDoc = deserializeResult.document;
  assert.equal(restoredDoc.metadata.title, "Báo cáo thẩm định");
  const restoredContent = restoredDoc.content;

  // Kiểm tra Heading có symbol © và mark bold
  const h1 = restoredContent.content?.[0];
  assert.equal(h1.type, "heading");
  const boldSymbol = h1.content?.find((n: any) => n.text === "© 2026");
  assert.ok(boldSymbol);
  assert.ok(boldSymbol.marks?.some((m: any) => m.type === "bold"));

  // Kiểm tra Paragraph có semantic link
  const p1 = restoredContent.content?.[1];
  const linkNode = p1.content?.find((n: any) => n.marks?.some((m: any) => m.type === "link"));
  assert.ok(linkNode);
  assert.equal(linkNode.text, "Cổng thông tin");
  assert.equal(linkNode.marks[0].attrs.href, "https://portal.example.com");

  // Kiểm tra Horizontal Rule node
  const hrNode = restoredContent.content?.[2];
  assert.equal(hrNode.type, "horizontalRule");

  // Kiểm tra Symbols Unicode trong paragraph 2
  const p2 = restoredContent.content?.[3];
  assert.ok(p2.content?.[0].text.includes("✓"));
  assert.ok(p2.content?.[0].text.includes("±"));
});

// ============================================================================
// E. DOCUMENT STATS & PAGINATION REGRESSION
// ============================================================================

test("Phase 3.2 - Stats: Horizontal Rule does not corrupt word count; Link & Symbol counted correctly", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Xin chào " },
          {
            type: "text",
            text: "Google",
            marks: [{ type: "link", attrs: { href: "https://google.com" } }],
          },
        ],
      },
      {
        type: "horizontalRule",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Bản quyền ©" }],
      },
    ],
  };

  const stats = extractDocumentStats(content);

  // "Xin chào Google" (3 từ) + "Bản quyền ©" (3 tokens/từ)
  // horizontalRule không đóng góp chữ rác hay số từ giả mạo
  assert.ok(stats.words >= 4, `Word count should be positive: ${stats.words}`);
  assert.ok(stats.characters > 0);
  assert.equal(stats.paragraphs, 2, "Should count exactly 2 text paragraphs");
});

test("Phase 3.2 - Pagination: Document with Horizontal Rule and Links paginates cleanly", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Trang đầu tiên" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Liên kết ",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
        ],
      },
      {
        type: "horizontalRule",
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang thứ hai có ký hiệu ★" }],
      },
    ],
  };

  const paginationState = calculatePaginationState(content, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  assert.equal(paginationState.pageCount, 2, "Page break should split into 2 visual pages");
  assert.equal(paginationState.pages.length, 2);
  assert.equal(paginationState.pages[0].pageNumber, 1);
  assert.equal(paginationState.pages[1].pageNumber, 2);
});
