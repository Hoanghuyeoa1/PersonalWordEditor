import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  isBuiltInStyleId,
  createDefaultStyleDefinitions,
  createDefaultStylesMetadata,
  generateCustomStyleId,
} from "./services/builtInStyles.ts";
import {
  validateDocumentStyle,
  validateStyleCollection,
  normalizeStyleCollection,
  validateParagraphProperties,
  validateCharacterProperties,
  hasCircularBasedOn,
} from "./validation/styleValidator.ts";
import type { DocumentStyle, DocumentStylesMetadata } from "./types/styleTypes.ts";
import { createInitialDocument, isValidDocumentModel } from "../document/documentModel.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
  type MwdFilePackage,
  MWD_FORMAT_IDENTIFIER,
  MWD_CURRENT_FORMAT_VERSION,
} from "../document/documentFile.ts";
import type { JSONContent } from "@tiptap/core";

test("Styles Engine 2.0 - 1. Built-in Normal Style definition", () => {
  const definitions = createDefaultStyleDefinitions();
  const normalStyle = definitions.find((s) => s.id === STYLE_NORMAL_ID);

  assert.ok(normalStyle, "Normal style must exist in default definitions");
  assert.equal(normalStyle.id, "style_normal");
  assert.equal(normalStyle.name, "Normal");
  assert.equal(normalStyle.type, "paragraph");
  assert.equal(normalStyle.basedOn, null);
  assert.equal(normalStyle.isBuiltIn, true);

  // Paragraph properties
  assert.ok(normalStyle.paragraph);
  assert.equal(normalStyle.paragraph.textAlign, "left");
  assert.equal(normalStyle.paragraph.lineSpacing, "1.15");
  assert.equal(normalStyle.paragraph.spacingBefore, 0);
  assert.equal(normalStyle.paragraph.spacingAfter, 8);
  assert.equal(normalStyle.paragraph.leftIndent, 0);
  assert.equal(normalStyle.paragraph.rightIndent, 0);

  // Character properties
  assert.ok(normalStyle.character);
  assert.equal(normalStyle.character.fontFamily, "Calibri");
  assert.equal(normalStyle.character.fontSize, 11);
  assert.equal(normalStyle.character.bold, false);
  assert.equal(normalStyle.character.italic, false);
  assert.equal(normalStyle.character.color, "#0f172a");
});

test("Styles Engine 2.0 - 2. Heading 1/2/3 built-ins definitions and hierarchy", () => {
  const definitions = createDefaultStyleDefinitions();
  const h1 = definitions.find((s) => s.id === STYLE_HEADING_1_ID);
  const h2 = definitions.find((s) => s.id === STYLE_HEADING_2_ID);
  const h3 = definitions.find((s) => s.id === STYLE_HEADING_3_ID);

  assert.ok(h1, "Heading 1 style must exist");
  assert.ok(h2, "Heading 2 style must exist");
  assert.ok(h3, "Heading 3 style must exist");

  // Names and types
  assert.equal(h1.name, "Heading 1");
  assert.equal(h2.name, "Heading 2");
  assert.equal(h3.name, "Heading 3");
  assert.equal(h1.type, "paragraph");
  assert.equal(h2.type, "paragraph");
  assert.equal(h3.type, "paragraph");

  // BasedOn Normal
  assert.equal(h1.basedOn, STYLE_NORMAL_ID);
  assert.equal(h2.basedOn, STYLE_NORMAL_ID);
  assert.equal(h3.basedOn, STYLE_NORMAL_ID);

  // isBuiltIn
  assert.equal(h1.isBuiltIn, true);
  assert.equal(h2.isBuiltIn, true);
  assert.equal(h3.isBuiltIn, true);

  // Semantic headingLevel attachment
  assert.equal(h1.paragraph?.headingLevel, 1);
  assert.equal(h2.paragraph?.headingLevel, 2);
  assert.equal(h3.paragraph?.headingLevel, 3);

  // Keep with next paragraph
  assert.equal(h1.paragraph?.keepWithNext, true);
  assert.equal(h2.paragraph?.keepWithNext, true);
  assert.equal(h3.paragraph?.keepWithNext, true);

  // Distinct font sizes descending
  assert.equal(h1.character?.fontSize, 16);
  assert.equal(h2.character?.fontSize, 13);
  assert.equal(h3.character?.fontSize, 12);

  // Bold headings
  assert.equal(h1.character?.bold, true);
  assert.equal(h2.character?.bold, true);
  assert.equal(h3.character?.bold, true);
});

test("Styles Engine 2.0 - 3. Deterministic Stable Style IDs", () => {
  assert.equal(STYLE_NORMAL_ID, "style_normal");
  assert.equal(STYLE_HEADING_1_ID, "style_heading_1");
  assert.equal(STYLE_HEADING_2_ID, "style_heading_2");
  assert.equal(STYLE_HEADING_3_ID, "style_heading_3");

  assert.equal(isBuiltInStyleId(STYLE_NORMAL_ID), true);
  assert.equal(isBuiltInStyleId(STYLE_HEADING_1_ID), true);
  assert.equal(isBuiltInStyleId(STYLE_HEADING_2_ID), true);
  assert.equal(isBuiltInStyleId(STYLE_HEADING_3_ID), true);
  assert.equal(isBuiltInStyleId("style_custom_123"), false);
  assert.equal(isBuiltInStyleId("random_id"), false);
});

test("Styles Engine 2.0 - 4. Custom style creation and validation", () => {
  const customId = generateCustomStyleId();
  assert.ok(customId.startsWith("style_custom_"));

  const customStyle: DocumentStyle = {
    id: customId,
    name: "Tóm tắt bài viết",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    nextStyleId: STYLE_NORMAL_ID,
    isBuiltIn: false,
    paragraph: {
      textAlign: "justify",
      lineSpacing: "1.5",
      spacingBefore: 6,
      spacingAfter: 6,
      leftIndent: 1,
      rightIndent: 1,
    },
    character: {
      fontFamily: "Georgia",
      fontSize: 10,
      italic: true,
      color: "#475569",
    },
  };

  const validation = validateDocumentStyle(customStyle);
  assert.equal(validation.isValid, true);
  assert.equal(validation.errors.length, 0);

  // Custom style cannot pretend to be built-in
  const illegalBuiltIn: DocumentStyle = {
    ...customStyle,
    isBuiltIn: true,
  };
  const illegalValidation = validateDocumentStyle(illegalBuiltIn);
  assert.equal(illegalValidation.isValid, false);
  assert.ok(illegalValidation.errors.some((e) => e.includes("không thể đặt isBuiltIn = true")));
});

test("Styles Engine 2.0 - 5. Duplicate name handling (case-insensitive)", () => {
  const defs = createDefaultStyleDefinitions();

  // Thêm custom style trùng tên với Normal ("normal")
  defs.push({
    id: "style_custom_duplicate",
    name: "normal", // Lowercase duplicate
    type: "paragraph",
    basedOn: null,
    isBuiltIn: false,
  });

  const res = validateStyleCollection(defs);
  assert.equal(res.isValid, false);
  assert.ok(
    res.errors.some((e) => e.includes("trùng lặp") && e.includes("normal")),
    "Must report duplicate name"
  );
});

test("Styles Engine 2.0 - 6. Malformed model safety & edge cases", () => {
  // 6.1 Empty ID and Empty Name
  const emptyStyle = {
    id: "",
    name: "  ",
    type: "paragraph",
    isBuiltIn: false,
  };
  const emptyRes = validateDocumentStyle(emptyStyle);
  assert.equal(emptyRes.isValid, false);
  assert.ok(emptyRes.errors.some((e) => e.includes("ID")));
  assert.ok(emptyRes.errors.some((e) => e.includes("name")));

  // 6.2 Invalid Style Type
  const invalidTypeStyle = {
    id: "style_test",
    name: "Test",
    type: "table_style",
    isBuiltIn: false,
  };
  const typeRes = validateDocumentStyle(invalidTypeStyle);
  assert.equal(typeRes.isValid, false);
  assert.ok(typeRes.errors.some((e) => e.includes("Loại Style")));

  // 6.3 Self-referencing basedOn
  const selfRefStyle = {
    id: "style_self",
    name: "Self",
    type: "paragraph",
    basedOn: "style_self",
    isBuiltIn: false,
  };
  const selfRes = validateDocumentStyle(selfRefStyle);
  assert.equal(selfRes.isValid, false);
  assert.ok(selfRes.errors.some((e) => e.includes("chính nó")));

  // 6.4 Circular basedOn chain detection (A -> B -> A)
  const map = new Map<string, DocumentStyle>();
  map.set("style_a", {
    id: "style_a",
    name: "Style A",
    type: "paragraph",
    basedOn: "style_b",
    isBuiltIn: false,
  });
  map.set("style_b", {
    id: "style_b",
    name: "Style B",
    type: "paragraph",
    basedOn: "style_a",
    isBuiltIn: false,
  });
  assert.equal(hasCircularBasedOn("style_a", map), true);

  // 6.5 Malformed properties: negative indents, negative spacing, invalid font size
  const badPropsRes = validateParagraphProperties({
    leftIndent: -2,
    spacingBefore: -10,
    textAlign: "diagonal",
    headingLevel: 5,
  });
  assert.equal(badPropsRes.isValid, false);
  assert.equal(badPropsRes.errors.length, 4);

  const badCharRes = validateCharacterProperties({
    fontSize: -5,
    fontFamily: "   ",
  });
  assert.equal(badCharRes.isValid, false);
  assert.equal(badCharRes.errors.length, 2);

  // 6.6 Normalizer recovery: malformed or empty array produces valid default built-ins safely
  const recovered = normalizeStyleCollection([
    null,
    { id: "", name: "" }, // corrupt item
    { id: "style_normal", name: "Customized Normal", type: "paragraph", isBuiltIn: true },
  ]);
  assert.ok(recovered.definitions.length >= 4);
  assert.ok(recovered.definitions.some((s) => s.id === STYLE_NORMAL_ID));
  assert.ok(recovered.definitions.some((s) => s.id === STYLE_HEADING_1_ID));
  assert.ok(recovered.definitions.some((s) => s.id === STYLE_HEADING_2_ID));
  assert.ok(recovered.definitions.some((s) => s.id === STYLE_HEADING_3_ID));
});

test("Styles Engine 2.0 - 7. DocumentModel style definitions integration", () => {
  const doc = createInitialDocument("Tài liệu thử nghiệm Styles");

  assert.ok(doc.styles, "doc.styles must be initialized");
  assert.equal(doc.styles.defaultParagraphStyleId, STYLE_NORMAL_ID);
  assert.equal(doc.styles.definitions.length, 4);

  // DocumentModel validation
  assert.equal(isValidDocumentModel(doc), true);

  // Serialization to .mwd
  const serialized = serializeDocumentToMwd(doc);
  assert.ok(serialized.includes('"styles"'));
  assert.ok(serialized.includes('"style_normal"'));
  assert.ok(serialized.includes('"style_heading_1"'));

  // Roundtrip deserialization
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (deserialized.success) {
    assert.ok(deserialized.document.styles);
    assert.equal(deserialized.document.styles.definitions.length, 4);
    assert.equal(deserialized.document.styles.defaultParagraphStyleId, STYLE_NORMAL_ID);
  }
});

test("Styles Engine 2.0 - 8. Backward compatibility with old document models lacking styles", () => {
  // Tạo giả lập một package .mwd phiên bản cũ hoàn toàn không có trường styles
  const oldPackage: MwdFilePackage = {
    format: MWD_FORMAT_IDENTIFIER,
    version: MWD_CURRENT_FORMAT_VERSION,
    metadata: {
      id: "doc-legacy-123",
      title: "Tài liệu cũ không có Styles",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung cũ vẫn render trơn tru." }],
        },
      ],
    },
  };

  const oldJson = JSON.stringify(oldPackage);
  const result = deserializeMwdToDocument(oldJson);

  assert.equal(result.success, true);
  if (result.success) {
    // Phải tự động bổ sung default styles metadata
    assert.ok(result.document.styles, "Document must acquire styles metadata automatically");
    assert.equal(result.document.styles.definitions.length, 4);
    assert.equal(result.document.styles.defaultParagraphStyleId, STYLE_NORMAL_ID);

    // Nội dung tài liệu cũ hoàn toàn nguyên vẹn
    assert.equal(result.document.content.type, "doc");
    assert.equal(result.document.content.content?.[0].type, "paragraph");
    assert.equal(result.document.content.content?.[0].content?.[0].text, "Nội dung cũ vẫn render trơn tru.");
  }
});

test("Styles Engine 2.0 - 9. Semantic Headings preserve genuine node type and level", () => {
  // Kiểm tra AST với các heading 1, 2, 3
  const astWithHeadings: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, id: "anchor-h1" },
        content: [{ type: "text", text: "Chương 1: Mở đầu" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung đoạn văn chương 1." }],
      },
      {
        type: "heading",
        attrs: { level: 2, id: "anchor-h2" },
        content: [{ type: "text", text: "1.1 Bối cảnh" }],
      },
      {
        type: "heading",
        attrs: { level: 3, id: "anchor-h3" },
        content: [{ type: "text", text: "1.1.1 Chi tiết kỹ thuật" }],
      },
    ],
  };

  const doc = createInitialDocument("Tài liệu chứa Heading");
  doc.content = astWithHeadings;

  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (deserialized.success) {
    const nodes = deserialized.document.content.content;
    assert.ok(nodes);

    // Heading 1 giữ nguyên type="heading", level=1 và có anchor id
    assert.equal(nodes[0].type, "heading");
    assert.equal(nodes[0].attrs?.level, 1);
    assert.ok(typeof nodes[0].attrs?.id === "string" && nodes[0].attrs.id.length > 0);

    // Paragraph thông thường
    assert.equal(nodes[1].type, "paragraph");

    // Heading 2 giữ nguyên type="heading" và level=2
    assert.equal(nodes[2].type, "heading");
    assert.equal(nodes[2].attrs?.level, 2);

    // Heading 3 giữ nguyên type="heading" và level=3
    assert.equal(nodes[3].type, "heading");
    assert.equal(nodes[3].attrs?.level, 3);
  }
});
