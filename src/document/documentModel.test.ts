import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultDocumentContent,
  createInitialDocument,
  isValidDocumentModel,
  updateDocumentContent,
  extractDocumentStats,
} from "./documentModel.ts";


test("Document Model: createDefaultDocumentContent returns valid ProseMirror doc", () => {
  const content = createDefaultDocumentContent();
  assert.equal(content.type, "doc");
  assert.ok(Array.isArray(content.content));
  assert.ok(content.content.length > 0);
  assert.equal(content.content[0].type, "paragraph");
});

test("Document Model: createInitialDocument initializes correct metadata", () => {
  const doc = createInitialDocument("Test Document");
  assert.ok(doc.metadata.id.length > 0);
  assert.equal(doc.metadata.title, "Test Document");
  assert.equal(doc.metadata.version, 1);
  assert.ok(!isNaN(Date.parse(doc.metadata.createdAt)));
  assert.ok(!isNaN(Date.parse(doc.metadata.updatedAt)));
  assert.equal(doc.content.type, "doc");
});

test("Document Model: isValidDocumentModel validates document structure", () => {
  const validDoc = createInitialDocument("Valid Doc");
  assert.equal(isValidDocumentModel(validDoc), true);

  assert.equal(isValidDocumentModel(null), false);
  assert.equal(isValidDocumentModel({}), false);
  assert.equal(isValidDocumentModel({ metadata: {} }), false);
  assert.equal(
    isValidDocumentModel({
      metadata: validDoc.metadata,
      content: { type: "not-a-doc" },
    }),
    false
  );
});

test("Document Model: updateDocumentContent increments version and updates timestamp", () => {
  const doc = createInitialDocument("Test Versioning");
  const newContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Updated paragraph line." }],
      },
    ],
  };

  const updated = updateDocumentContent(doc, newContent);
  assert.equal(updated.metadata.version, 2);
  assert.equal(updated.content, newContent);
  assert.ok(new Date(updated.metadata.updatedAt).getTime() >= new Date(doc.metadata.createdAt).getTime());
});

test("Document Model: extractDocumentStats accurately calculates words, chars, and paragraphs", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Tiêu đề một" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thứ nhất có bảy từ." }],
      },
    ],
  };

  const stats = extractDocumentStats(content);
  assert.equal(stats.paragraphs, 2);
  assert.ok(stats.words > 0);
  assert.ok(stats.characters > 0);
});
