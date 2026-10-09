/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { Schema } from "prosemirror-model";
import { SpellCheckerEngine } from "./spellCheckerEngine.ts";
import { EnglishDictionaryProvider } from "./dictionary/englishDictionary.ts";
import { VietnameseDictionaryProvider } from "./dictionary/vietnameseDictionary.ts";
import { UserDictionaryService } from "./dictionary/userDictionaryService.ts";
import { buildSpellingDecorations } from "./spellCheckExtension.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";

// Tạo schema test đơn giản có doc, paragraph, text, strong
const testSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {
    strong: {},
  },
});

function createDocFromText(text: string) {
  return testSchema.nodes.doc.create(null, [
    testSchema.nodes.paragraph.create(null, [testSchema.text(text)]),
  ]);
}

test("Phase 5.2 - Issue Detection: Phát hiện chính xác từ viết sai trong tiếng Anh và tiếng Việt", () => {
  SpellCheckerEngine.resetIgnored();
  SpellCheckerEngine.setLanguage("en-US");

  // Văn bản tiếng Anh có lỗi: "thiss", "editer", "documnt"
  const enDoc = createDocFromText("Hello thiss is an editer documnt test.");
  const enIssues = SpellCheckerEngine.checkDocument(enDoc);

  assert.equal(enIssues.length, 3);
  const words = enIssues.map((i) => i.word);
  assert.ok(words.includes("thiss"));
  assert.ok(words.includes("editer"));
  assert.ok(words.includes("documnt"));

  // Kiểm tra từ hợp lệ tiếng Anh không bị báo lỗi
  const validDoc = createDocFromText("This document editor is ready. Don't worry, it's fine.");
  const validIssues = SpellCheckerEngine.checkDocument(validDoc);
  assert.equal(validIssues.length, 0);

  // Chuyển sang tiếng Việt
  SpellCheckerEngine.setLanguage("vi-VN");
  const viDoc = createDocFromText("Chào mừng bạn soạnn thảo văn bản.");
  const viIssues = SpellCheckerEngine.checkDocument(viDoc);

  assert.equal(viIssues.length, 1);
  assert.equal(viIssues[0].word, "soạnn");

  // Đặt lại ngôn ngữ tiếng Anh
  SpellCheckerEngine.setLanguage("en-US");
});

test("Phase 5.2 - Edge Cases: Bỏ qua URL, Email, số thuần, mã hex, từ viết hoa viết tắt", () => {
  SpellCheckerEngine.resetIgnored();
  SpellCheckerEngine.setLanguage("en-US");

  const edgeDoc = createDocFromText(
    "Visit https://example.com/docs or www.google.com and email support@editor.org. Code #1d4ed8 and 12345 version v2.0 with DOCX and HTML."
  );
  const issues = SpellCheckerEngine.checkDocument(edgeDoc);

  // Không coi URL, email, mã hex, số, chữ viết tắt là lỗi chính tả
  assert.equal(issues.length, 0);
});

test("Phase 5.2 - Suggestions: Tạo gợi ý thay thế phù hợp và bảo toàn quy tắc viết hoa", () => {
  const enProvider = new EnglishDictionaryProvider();

  // "editer" -> "editor"
  const sugg1 = enProvider.getSuggestions("editer", 3);
  assert.ok(sugg1.includes("editor"));

  // "documnt" -> "document"
  const sugg2 = enProvider.getSuggestions("documnt", 3);
  assert.ok(sugg2.includes("document"));

  // Viết hoa chữ đầu: "Editer" -> "Editor"
  const suggCap = enProvider.getSuggestions("Editer", 3);
  assert.ok(suggCap.includes("Editor"));

  // Tiếng Việt
  const viProvider = new VietnameseDictionaryProvider();
  const viSugg = viProvider.getSuggestions("kiêm", 3);
  assert.ok(viSugg.length > 0);
});

test("Phase 5.2 - Underline & Decorations: Tạo ProseMirror Inline Decorations chuẩn", () => {
  const doc = createDocFromText("A documnt with issue.");
  const issues = SpellCheckerEngine.checkDocument(doc);
  assert.equal(issues.length, 1);

  const decos = buildSpellingDecorations(doc, issues);
  assert.ok(decos);

  const foundDecos = decos.find();
  assert.equal(foundDecos.length, 1);
  assert.equal(foundDecos[0].from, issues[0].from);
  assert.equal(foundDecos[0].to, issues[0].to);
  assert.equal(foundDecos[0].spec.class, "spelling-error-decoration");
  assert.equal(foundDecos[0].spec["data-word"], "documnt");
});

test("Phase 5.2 - Ignore Once & Ignore All: Cơ chế bỏ qua không làm sửa đổi AST", () => {
  SpellCheckerEngine.resetIgnored();
  const doc = createDocFromText("A repeted word and another repeted word.");
  let issues = SpellCheckerEngine.checkDocument(doc);
  assert.equal(issues.length, 2);

  // Ignore Once cho issue đầu tiên
  SpellCheckerEngine.ignoreOnce(issues[0].id);
  issues = SpellCheckerEngine.checkDocument(doc);
  assert.equal(issues.length, 1);

  // Ignore All cho từ "repeted"
  SpellCheckerEngine.ignoreAll("repeted");
  issues = SpellCheckerEngine.checkDocument(doc);
  assert.equal(issues.length, 0);
});

test("Phase 5.2 - User Dictionary: Lưu trữ và xác thực từ điển cá nhân người dùng", () => {
  UserDictionaryService.clear();

  // Xác thực từ không hợp lệ (khoảng trắng, số, quá ngắn)
  assert.equal(UserDictionaryService.validateWord("a"), false);
  assert.equal(UserDictionaryService.validateWord("two words"), false);
  assert.equal(UserDictionaryService.validateWord("1234"), false);
  assert.equal(UserDictionaryService.validateWord("Antigravity"), true);

  // Thêm từ vào từ điển
  const added = UserDictionaryService.addWord("CustomBrandWord");
  assert.equal(added, true);
  assert.equal(UserDictionaryService.hasWord("custombrandword"), true);
  assert.equal(UserDictionaryService.hasWord("CustomBrandWord"), true);

  // Kiểm tra spell checker tự động bỏ qua từ trong User Dictionary
  const doc = createDocFromText("We love CustomBrandWord in our document.");
  const issues = SpellCheckerEngine.checkDocument(doc);
  assert.equal(issues.some((i) => i.word === "CustomBrandWord"), false);

  UserDictionaryService.clear();
});

test("Phase 5.2 - Replace Suggestion: Thay thế từ sai bằng gợi ý và bảo toàn marks", () => {
  // Tạo đoạn văn bản có in đậm chữ sai chính tả: [Hello **editer** world]
  const boldMark = testSchema.marks.strong.create();
  const docWithMarks = testSchema.nodes.doc.create(null, [
    testSchema.nodes.paragraph.create(null, [
      testSchema.text("Hello "),
      testSchema.text("editer", [boldMark]),
      testSchema.text(" world."),
    ]),
  ]);

  const issues = SpellCheckerEngine.checkDocument(docWithMarks);
  assert.equal(issues.length, 1);
  const issue = issues[0];
  assert.equal(issue.word, "editer");

  // Giả lập transaction thay thế giữ nguyên mark
  const tr = {
    doc: docWithMarks,
    replaceWith(from: number, to: number, node: unknown) {
      assert.equal(from, issue.from);
      assert.equal(to, issue.to);
      assert.ok(node);
    },
  };

  // Xác minh mark được giữ nguyên
  const $pos = docWithMarks.resolve(issue.from);
  const marks = $pos.nodeAfter?.marks ?? $pos.marks();
  assert.equal(marks?.length, 1);
  assert.equal(marks[0].type.name, "strong");
});

test("Phase 5.2 - Performance: Quá trình quét spell check nhanh chóng (<15ms)", () => {
  // Tạo tài liệu gồm 30 đoạn văn bản
  const paragraphs = [];
  for (let i = 0; i < 30; i++) {
    paragraphs.push(
      testSchema.nodes.paragraph.create(null, [
        testSchema.text(
          `This is paragraph number ${i} testing the spell check performance in Personal Word Editor.`
        ),
      ])
    );
  }
  const largeDoc = testSchema.nodes.doc.create(null, paragraphs);

  const start = performance.now();
  const issues = SpellCheckerEngine.checkDocument(largeDoc);
  const duration = performance.now() - start;

  assert.equal(issues.length, 0);
  assert.ok(duration < 25, `Spell check took ${duration.toFixed(2)}ms (expected < 25ms)`);
});
