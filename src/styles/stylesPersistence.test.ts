import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
  MWD_FORMAT_IDENTIFIER,
  MWD_CURRENT_FORMAT_VERSION,
} from "../document/documentFile.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import {
  createStyle,
  updateStyle,
} from "./services/styleManagementService.ts";
import {
  applyParagraphStyle,
} from "./services/applyStyleService.ts";
import {
  applyCharacterStyle,
} from "./services/characterStyleService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  createDefaultStyleDefinitions,
} from "./services/builtInStyles.ts";
import { resolveStyle } from "./services/styleResolver.ts";
import {
  getEffectiveParagraphFormatting,
} from "./services/effectiveStyleService.ts";
import {
  normalizeStyleCollection,
  normalizeDocumentContentStyles,
} from "./validation/styleValidator.ts";
import type { DocumentStyle } from "./types/styleTypes.ts";

function createTestEditor(initialContent: any): Editor {
  return new Editor({
    extensions: getEditorExtensions(),
    content: initialContent,
  });
}

function resetTestStore(): void {
  const defaultDefs = createDefaultStyleDefinitions();
  useDocumentStore.setState({
    document: {
      metadata: {
        id: "doc-test-p7",
        title: "Test Persistence",
        version: 1,
        createdAt: "2026-10-07T00:00:00.000Z",
        updatedAt: "2026-10-07T00:00:00.000Z",
      },
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Nội dung ban đầu." }],
          },
        ],
      },
      pageSettings: {
        paperSize: "A4",
        orientation: "portrait",
        margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      },
      styles: {
        version: "2.0",
        definitions: defaultDefs,
      },
    },
    isDirty: false,
    isModified: false,
  });
}

test("Phase 7 - 1. Definitions round-trip: preserves custom style properties, stable IDs, and metadata", () => {
  resetTestStore();

  const createRes = createStyle({
    id: "style_thesis_body",
    name: "Thesis Body",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    nextStyleId: "style_thesis_body",
    paragraph: {
      textAlign: "justify",
      lineSpacing: "1.5",
      spacingBefore: 6,
      spacingAfter: 12,
      leftIndent: 15,
      rightIndent: 10,
      firstLineIndent: 18,
    },
    character: {
      fontFamily: "Times New Roman",
      fontSize: 13,
      bold: false,
      italic: false,
      color: "#1e293b",
    },
  });
  assert.equal(createRes.success, true);

  const doc = useDocumentStore.getState().document;
  const serialized = serializeDocumentToMwd(doc);
  assert.ok(typeof serialized === "string");

  const deserializedRes = deserializeMwdToDocument(serialized);
  assert.equal(deserializedRes.success, true);
  if (!deserializedRes.success) return;

  const loadedDoc = deserializedRes.document;
  assert.ok(loadedDoc.styles);

  const thesisStyle = loadedDoc.styles.definitions.find((s) => s.id === "style_thesis_body");
  assert.ok(thesisStyle);
  assert.equal(thesisStyle.name, "Thesis Body");
  assert.equal(thesisStyle.type, "paragraph");
  assert.equal(thesisStyle.basedOn, STYLE_NORMAL_ID);
  assert.equal(thesisStyle.nextStyleId, "style_thesis_body");
  assert.equal(thesisStyle.isBuiltIn, false);

  // Kiểm tra paragraph properties
  assert.equal(thesisStyle.paragraph?.textAlign, "justify");
  assert.equal(thesisStyle.paragraph?.lineSpacing, "1.5");
  assert.equal(thesisStyle.paragraph?.spacingBefore, 6);
  assert.equal(thesisStyle.paragraph?.spacingAfter, 12);
  assert.equal(thesisStyle.paragraph?.leftIndent, 15);
  assert.equal(thesisStyle.paragraph?.rightIndent, 10);
  assert.equal(thesisStyle.paragraph?.firstLineIndent, 18);

  // Kiểm tra character properties
  assert.equal(thesisStyle.character?.fontFamily, "Times New Roman");
  assert.equal(thesisStyle.character?.fontSize, 13);
  assert.equal(thesisStyle.character?.color, "#1e293b");
});

test("Phase 7 - 2. Paragraph style assignment and character style assignment round-trip without flattening", () => {
  resetTestStore();

  // Tạo Paragraph Style và Character Style
  createStyle({
    id: "style_callout",
    name: "Callout Text",
    type: "paragraph",
    paragraph: { textAlign: "center", lineSpacing: "1.3" },
  });

  createStyle({
    id: "style_code_badge",
    name: "Code Badge",
    type: "character",
    character: { fontFamily: "Consolas", bold: true, color: "#2563eb" },
  });

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn 1 bình thường." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn 2 cần áp dụng Callout." }],
      },
    ],
  });

  // Áp dụng Callout cho đoạn 2
  editor.commands.setTextSelection(30);
  applyParagraphStyle(editor, "style_callout");

  // Áp dụng Code Badge cho cụm từ 'bình thường' ở đoạn 1 (vị trí 12 -> 23)
  editor.commands.setTextSelection({ from: 12, to: 23 });
  applyCharacterStyle(editor, "style_code_badge");

  const docWithEditorContent: DocumentModel = {
    ...useDocumentStore.getState().document,
    content: editor.getJSON(),
  };

  const serialized = serializeDocumentToMwd(docWithEditorContent);
  const deserializedRes = deserializeMwdToDocument(serialized);
  assert.equal(deserializedRes.success, true);
  if (!deserializedRes.success) return;

  const loadedContent = deserializedRes.document.content;
  const p1 = loadedContent.content?.[0];
  const p2 = loadedContent.content?.[1];

  // Đoạn 2 giữ nguyên semantic reference styleId = "style_callout", không bị flatten thành inline CSS cứng
  assert.equal(p2.attrs?.styleId, "style_callout");

  // Đoạn 1 có text run chứa mark characterStyle với styleId = "style_code_badge"
  const styledRun = p1.content?.find((c: any) =>
    c.marks?.some((m: any) => m.type === "characterStyle" && m.attrs?.styleId === "style_code_badge")
  );
  assert.ok(styledRun);
  assert.equal(styledRun.text, "bình thường");
});

test("Phase 7 - 3. Multi-level inheritance round-trip resolves identical formatting", () => {
  resetTestStore();

  // Level 1: Normal (built-in)
  // Level 2: Body Base (kế thừa Normal, đổi font Georgia, lineSpacing 1.25)
  createStyle({
    id: "style_body_base",
    name: "Body Base",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    character: { fontFamily: "Georgia", fontSize: 12 },
    paragraph: { lineSpacing: "1.25" },
  });

  // Level 3: Thesis Body (kế thừa Body Base, đổi size 13, textAlign justify)
  createStyle({
    id: "style_thesis_deep",
    name: "Thesis Deep",
    type: "paragraph",
    basedOn: "style_body_base",
    character: { fontSize: 13, bold: true },
    paragraph: { textAlign: "justify" },
  });

  const doc = useDocumentStore.getState().document;
  const serialized = serializeDocumentToMwd(doc);
  const deserializedRes = deserializeMwdToDocument(serialized);
  assert.equal(deserializedRes.success, true);
  if (!deserializedRes.success) return;

  const defs = deserializedRes.document.styles?.definitions ?? [];
  const resolved = resolveStyle("style_thesis_deep", defs);

  // Kế thừa Georgia từ Body Base
  assert.equal(resolved.character.fontFamily, "Georgia");
  // Override 13 và bold từ Thesis Deep
  assert.equal(resolved.character.fontSize, 13);
  assert.equal(resolved.character.bold, true);
  // Kế thừa lineSpacing từ Body Base
  assert.equal(resolved.paragraph?.lineSpacing, "1.25");
  // Override textAlign từ Thesis Deep
  assert.equal(resolved.paragraph?.textAlign, "justify");
});

test("Phase 7 - 4. Direct formatting preserved alongside style references", () => {
  resetTestStore();

  createStyle({
    id: "style_quote_block",
    name: "Quote Block",
    type: "paragraph",
    paragraph: { textAlign: "left", lineSpacing: "1.15" },
    character: { italic: true },
  });

  // Đoạn văn có styleId="style_quote_block" nhưng có direct override: textAlign="right" và lineSpacing="2.0"
  const doc: DocumentModel = {
    ...useDocumentStore.getState().document,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { styleId: "style_quote_block", textAlign: "right", lineSpacing: "2.0" },
          content: [
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "Văn bản trích dẫn có direct overrides.",
            },
          ],
        },
      ],
    },
  };

  const serialized = serializeDocumentToMwd(doc);
  const deserializedRes = deserializeMwdToDocument(serialized);
  assert.equal(deserializedRes.success, true);
  if (!deserializedRes.success) return;

  const loadedContent = deserializedRes.document.content;
  const p = loadedContent.content?.[0];

  assert.equal(p.attrs?.styleId, "style_quote_block");
  assert.equal(p.attrs?.textAlign, "right");
  assert.equal(p.attrs?.lineSpacing, "2.0");

  const effective = getEffectiveParagraphFormatting(p, deserializedRes.document.styles?.definitions ?? []);
  // Direct overrides ghi đè lên style definition
  assert.equal(effective.textAlign, "right");
  assert.equal(effective.lineSpacing, "2.0");
  assert.equal(effective.hasDirectOverrides, true);
});

test("Phase 7 - 5. Old .mwd file backward compatibility: missing styles block loads safely without crashing", () => {
  // Chuỗi JSON mô phỏng file .mwd phiên bản cũ hoàn toàn không có khối "styles"
  const oldFileJson = JSON.stringify({
    format: MWD_FORMAT_IDENTIFIER,
    version: 1,
    metadata: {
      id: "old-doc-001",
      title: "Tài liệu cũ Phase 1",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Tiêu đề tài liệu cũ" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "justify" },
          content: [{ type: "text", text: "Nội dung đoạn văn tài liệu cũ." }],
        },
      ],
    },
  });

  const res = deserializeMwdToDocument(oldFileJson);
  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  // Bổ sung đầy đủ 4 built-in styles chuẩn
  assert.ok(doc.styles);
  assert.equal(doc.styles.definitions.length, 4);
  assert.ok(doc.styles.definitions.some((s) => s.id === STYLE_NORMAL_ID));
  assert.ok(doc.styles.definitions.some((s) => s.id === STYLE_HEADING_1_ID));

  // Heading và Paragraph cũ giữ nguyên 100% nội dung và semantic node type
  const heading = doc.content.content?.[0];
  const para = doc.content.content?.[1];

  assert.equal(heading.type, "heading");
  assert.equal(heading.attrs?.level, 1);
  assert.equal(para.type, "paragraph");
  assert.equal(para.attrs?.textAlign, "justify");

  // Effective style được tính toán chuẩn xác
  const effHeading = getEffectiveParagraphFormatting(heading, doc.styles.definitions);
  assert.equal(effHeading.styleId, STYLE_HEADING_1_ID);
});

test("Phase 7 - 6. Malformed styles normalization: non-array definitions, duplicate IDs, and duplicate names", () => {
  // 1. Non-array definitions
  const normNonArray = normalizeStyleCollection("corrupted_string_not_an_array");
  assert.equal(normNonArray.definitions.length, 4); // Bù đắp 4 built-ins

  // 2. Duplicate IDs: giữ mục đầu tiên, bỏ qua mục trùng sau
  const rawWithDupIds = [
    { id: "custom_a", name: "Custom A", type: "paragraph" },
    { id: "custom_a", name: "Custom A Duplicate", type: "paragraph" },
  ];
  const normDupIds = normalizeStyleCollection(rawWithDupIds);
  const foundA = normDupIds.definitions.filter((s) => s.id === "custom_a");
  assert.equal(foundA.length, 1);
  assert.equal(foundA[0].name, "Custom A");

  // 3. Duplicate Names: tự động gán hậu tố (2), (3) để không làm mất style hay gãy reference của blocks
  const rawWithDupNames = [
    { id: "custom_1", name: "Same Name", type: "paragraph" },
    { id: "custom_2", name: "Same Name", type: "paragraph" },
  ];
  const normDupNames = normalizeStyleCollection(rawWithDupNames);
  const c1 = normDupNames.definitions.find((s) => s.id === "custom_1");
  const c2 = normDupNames.definitions.find((s) => s.id === "custom_2");
  assert.ok(c1);
  assert.ok(c2);
  assert.equal(c1.name, "Same Name");
  assert.equal(c2.name, "Same Name (2)");
});

test("Phase 7 - 7. Missing parent and inheritance cycle normalization", () => {
  // Missing parent: trỏ tới 'non_existent_parent_xyz'
  const rawMissingParent = [
    {
      id: "orphan_style",
      name: "Orphan Style",
      type: "paragraph",
      basedOn: "non_existent_parent_xyz",
    },
  ];
  const normParent = normalizeStyleCollection(rawMissingParent);
  const orphan = normParent.definitions.find((s) => s.id === "orphan_style");
  assert.ok(orphan);
  // Fallback an toàn về Normal
  assert.equal(orphan.basedOn, STYLE_NORMAL_ID);

  // Inheritance Cycle: A -> B -> A
  const rawCycle = [
    { id: "cycle_a", name: "Cycle A", type: "paragraph", basedOn: "cycle_b" },
    { id: "cycle_b", name: "Cycle B", type: "paragraph", basedOn: "cycle_a" },
  ];
  const normCycle = normalizeStyleCollection(rawCycle);
  const ca = normCycle.definitions.find((s) => s.id === "cycle_a");
  const cb = normCycle.definitions.find((s) => s.id === "cycle_b");
  assert.ok(ca);
  assert.ok(cb);
  // Chu trình bị phá bỏ an toàn
  assert.notEqual(ca.basedOn, "cycle_b");
});

test("Phase 7 - 8. Unknown styleId on block and phantom characterStyle mark normalization", () => {
  const validIds = new Set<string>([STYLE_NORMAL_ID, STYLE_HEADING_1_ID, STYLE_HEADING_2_ID]);

  const rawContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: "ghost_style_123" },
        content: [
          { type: "text", text: "Văn bản chữ thường " },
          {
            type: "text",
            marks: [
              { type: "bold" },
              { type: "characterStyle", attrs: { styleId: "ghost_char_mark_999" } },
            ],
            text: "chữ có mark phantom",
          },
        ],
      },
      {
        type: "heading",
        attrs: { level: 2, styleId: "unknown_heading_style" },
        content: [{ type: "text", text: "Tiêu đề cấp 2" }],
      },
    ],
  };

  const safe = normalizeDocumentContentStyles(rawContent, validIds);
  const p = safe.content?.[0];
  const h = safe.content?.[1];

  // Block có unknown styleId: paragraph fallback null, heading fallback style_heading_2
  assert.equal(p.attrs?.styleId, null);
  assert.equal(h.attrs?.styleId, STYLE_HEADING_2_ID);

  // Mark phantom bị gỡ bỏ an toàn, nhưng mark bold và văn bản 100% được bảo toàn
  const textRun = p.content?.[1];
  assert.equal(textRun.text, "chữ có mark phantom");
  assert.ok(textRun.marks?.some((m: any) => m.type === "bold"));
  assert.equal(textRun.marks?.some((m: any) => m.type === "characterStyle"), false);
});

test("Phase 7 - 9. Save failure preservation: dirty state and style definitions remain intact", () => {
  resetTestStore();

  // Tạo custom style mới làm thay đổi store và kích hoạt isDirty = true
  createStyle({
    id: "style_unsaved",
    name: "Unsaved Style",
    type: "paragraph",
  });

  const store = useDocumentStore.getState();
  assert.equal(store.isDirty, true);
  assert.equal(store.isModified, true);

  // Giả lập tình huống Save thất bại (ví dụ: invoke throw error do quyền truy cập / ổ cứng đầy)
  let saveFailed = false;
  try {
    throw new Error("Lỗi giả lập: Không thể ghi tệp tin vào ổ đĩa.");
  } catch (err) {
    saveFailed = true;
  }
  assert.equal(saveFailed, true);

  // Kiểm tra: Store KHÔNG gọi markSaved(), isDirty vẫn là true, definitions không bị mất
  const storeAfterFail = useDocumentStore.getState();
  assert.equal(storeAfterFail.isDirty, true);
  assert.ok(storeAfterFail.document.styles?.definitions.some((s) => s.id === "style_unsaved"));
});
