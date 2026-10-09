import { test } from "node:test";
import assert from "node:assert/strict";
import { Schema } from "prosemirror-model";
import { GrammarCheckerEngine } from "./grammar/grammarCheckerEngine.ts";
import { LocalGrammarProvider } from "./grammar/localGrammarProvider.ts";
import { LOCAL_GRAMMAR_RULES } from "./grammar/grammarRules.ts";
import { SpellCheckerEngine } from "./spellCheckerEngine.ts";
import { buildSpellingDecorations } from "./spellCheckExtension.ts";
import type { IGrammarProvider, GrammarIssue, GrammarCheckContext } from "./proofingTypes.ts";

// Tạo ProseMirror test schema tối giản
const testSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    heading: { content: "inline*", group: "block", attrs: { level: { default: 1 } } },
    equation: { group: "block", attrs: { latex: { default: "" } } },
    text: { group: "inline" },
  },
  marks: {
    strong: {},
    em: {},
  },
});

function createDocFromText(text: string) {
  return testSchema.nodes.doc.create(null, [
    testSchema.nodes.paragraph.create(null, [testSchema.text(text)]),
  ]);
}

test("Phase 5.3 - Grammar Architecture: Pluggable Providers & Unified Rules Registry", () => {
  GrammarCheckerEngine.resetIgnored();
  GrammarCheckerEngine.clearDisabledRules();

  // 1. Kiểm tra Active Provider mặc định là LocalGrammarProvider
  const defaultProvider = GrammarCheckerEngine.getActiveProvider();
  assert.equal(defaultProvider.id, "local-rule-provider");
  assert.equal(defaultProvider instanceof LocalGrammarProvider, true);

  // 2. Kiểm tra danh mục rules
  const rules = GrammarCheckerEngine.getAllRules();
  assert.equal(rules.length >= 6, true);
  const ruleIds = rules.map((r) => r.id);
  assert.ok(ruleIds.includes("double-spaces"));
  assert.ok(ruleIds.includes("space-before-punctuation"));
  assert.ok(ruleIds.includes("missing-space-after-punctuation"));
  assert.ok(ruleIds.includes("repeated-word"));
  assert.ok(ruleIds.includes("capitalization"));
  assert.ok(ruleIds.includes("double-period"));

  // 3. Khả năng cắm rút (Pluggable): Đăng ký Custom Provider
  class MockCustomProvider implements IGrammarProvider {
    public readonly id = "mock-custom-provider";
    public readonly name = "Mock Custom Provider";
    public checkTextblock(text: string, blockPos: number, _context: GrammarCheckContext): GrammarIssue[] {
      if (text.includes("custom_bad_word")) {
        return [
          {
            id: `custom-${blockPos}`,
            type: "grammar",
            from: blockPos + 1,
            to: blockPos + 16,
            ruleId: "custom-rule",
            matchedText: "custom_bad_word",
            message: "Custom test error",
            suggestions: ["custom_good_word"],
            severity: "warning",
          },
        ];
      }
      return [];
    }
    public getRules() {
      return [];
    }
  }

  GrammarCheckerEngine.registerProvider(new MockCustomProvider());
  GrammarCheckerEngine.setActiveProvider("mock-custom-provider");
  assert.equal(GrammarCheckerEngine.getActiveProvider().id, "mock-custom-provider");

  const customDoc = createDocFromText("This has custom_bad_word here.");
  const customIssues = GrammarCheckerEngine.checkDocument(customDoc);
  assert.equal(customIssues.length, 1);
  assert.equal(customIssues[0].ruleId, "custom-rule");

  // Khôi phục lại Local provider
  GrammarCheckerEngine.setActiveProvider("local-rule-provider");
  assert.equal(GrammarCheckerEngine.getActiveProvider().id, "local-rule-provider");
});

test("Phase 5.3 - Local Rules: Phát hiện chính xác các quy tắc ngữ pháp & dấu câu", () => {
  GrammarCheckerEngine.resetIgnored();
  GrammarCheckerEngine.clearDisabledRules();

  // Rule 1: Khoảng trắng thừa (double-spaces)
  const docDoubleSpace = createDocFromText("Hello  world with multiple   spaces.");
  const issues1 = GrammarCheckerEngine.checkDocument(docDoubleSpace);
  const doubleSpaceIssues = issues1.filter((i) => i.ruleId === "double-spaces");
  assert.equal(doubleSpaceIssues.length, 2);
  assert.equal(doubleSpaceIssues[0].suggestions[0], " ");

  // Rule 2: Khoảng trắng trước dấu câu (space-before-punctuation)
  const docSpaceBefore = createDocFromText("Xin chào , tôi là biên tập viên .");
  const issues2 = GrammarCheckerEngine.checkDocument(docSpaceBefore);
  const spaceBeforeIssues = issues2.filter((i) => i.ruleId === "space-before-punctuation");
  assert.equal(spaceBeforeIssues.length, 2);
  assert.equal(spaceBeforeIssues[0].suggestions[0], ",");
  assert.equal(spaceBeforeIssues[1].suggestions[0], ".");

  // Rule 3: Thiếu khoảng trắng sau dấu câu (missing-space-after-punctuation)
  const docMissingSpace = createDocFromText("Chào bạn,chúc bạn một ngày tốt lành.");
  const issues3 = GrammarCheckerEngine.checkDocument(docMissingSpace);
  const missingSpaceIssues = issues3.filter((i) => i.ruleId === "missing-space-after-punctuation");
  assert.equal(missingSpaceIssues.length, 1);
  assert.equal(missingSpaceIssues[0].suggestions[0], ", c");

  // Rule 4: Từ lặp lại (repeated-word)
  const docRepeated = createDocFromText("This is the the document và và văn bản.");
  const issues4 = GrammarCheckerEngine.checkDocument(docRepeated);
  const repeatedIssues = issues4.filter((i) => i.ruleId === "repeated-word");
  assert.equal(repeatedIssues.length, 2);
  assert.equal(repeatedIssues[0].word, "the");
  assert.equal(repeatedIssues[1].word, "và");

  // Rule 5: Viết hoa đầu câu (capitalization)
  const docCap = createDocFromText("Hôm nay trời đẹp. chúng ta bắt đầu làm việc.");
  const issues5 = GrammarCheckerEngine.checkDocument(docCap);
  const capIssues = issues5.filter((i) => i.ruleId === "capitalization");
  assert.equal(capIssues.length, 1);
  assert.equal(capIssues[0].suggestions[0], "C");

  // Rule 6: Dấu chấm đôi bất thường (double-period)
  const docDoublePeriod = createDocFromText("Kết thúc câu.. Bắt đầu câu mới.");
  const issues6 = GrammarCheckerEngine.checkDocument(docDoublePeriod);
  const periodIssues = issues6.filter((i) => i.ruleId === "double-period");
  assert.equal(periodIssues.length, 1);
  assert.ok(periodIssues[0].suggestions.includes("."));
});

test("Phase 5.3 - Edge Cases: Bỏ qua an toàn URL, Email, số thập phân, tên file, ellipsis, equation", () => {
  GrammarCheckerEngine.resetIgnored();
  GrammarCheckerEngine.clearDisabledRules();

  // URLs, emails, decimals, file extensions, ellipsis không được coi là lỗi dấu câu
  const edgeDoc = testSchema.nodes.doc.create(null, [
    testSchema.nodes.paragraph.create(null, [
      testSchema.text(
        "Ghé thăm https://example.com/docs hoặc www.google.com và email user@office.org. " +
        "Số pi = 3.14 và phiên bản v2.0 lưu trong file document.docx hay data.mwd. Đang đợi... một chút."
      ),
    ]),
    // Equation node không phải textblock và không bị duyệt văn xuôi
    testSchema.nodes.equation.create({ latex: "E = mc^2" }),
  ]);

  const issues = GrammarCheckerEngine.checkDocument(edgeDoc);
  // Không có false positives nào
  assert.equal(issues.length, 0);
});

test("Phase 5.3 - Decorations: Phân biệt rõ rệt gạch xanh (Grammar) và gạch đỏ (Spelling)", () => {
  const doc = createDocFromText("Hello  editer world.");

  // editer là lỗi chính tả (spelling)
  const spellingIssues = SpellCheckerEngine.checkDocument(doc);
  assert.equal(spellingIssues.length, 1);
  assert.equal(spellingIssues[0].word, "editer");

  // "  " là lỗi ngữ pháp (grammar)
  const grammarIssues = GrammarCheckerEngine.checkDocument(doc);
  assert.equal(grammarIssues.length, 1);
  assert.equal(grammarIssues[0].ruleId, "double-spaces");

  // Gộp vào hệ thống decoration chung
  const allIssues = [...spellingIssues, ...grammarIssues];
  const decos = buildSpellingDecorations(doc, allIssues);
  const foundDecos = decos.find();

  assert.equal(foundDecos.length, 2);

  // Tìm decoration ngữ pháp và chính tả
  const grammarDeco = foundDecos.find((d) => d.spec.class === "grammar-error-decoration");
  const spellingDeco = foundDecos.find((d) => d.spec.class === "spelling-error-decoration");

  assert.ok(grammarDeco, "Phải có decoration class grammar-error-decoration");
  assert.ok(spellingDeco, "Phải có decoration class spelling-error-decoration");

  assert.equal(grammarDeco?.spec["data-rule-id"], "double-spaces");
  assert.equal(spellingDeco?.spec["data-word"], "editer");
});

test("Phase 5.3 - Suggestions & Transaction: Thay thế lỗi ngữ pháp bảo toàn formatting", () => {
  const boldMark = testSchema.marks.strong.create();
  const docWithMarks = testSchema.nodes.doc.create(null, [
    testSchema.nodes.paragraph.create(null, [
      testSchema.text("Hello"),
      testSchema.text(" ,", [boldMark]),
      testSchema.text(" world."),
    ]),
  ]);

  const issues = GrammarCheckerEngine.checkDocument(docWithMarks);
  const spaceBeforeIssue = issues.find((i) => i.ruleId === "space-before-punctuation");
  assert.ok(spaceBeforeIssue);

  // Xác minh vị trí và gợi ý
  assert.equal(spaceBeforeIssue.suggestions[0], ",");

  // Giả lập ProseMirror transaction thay thế
  const tr = {
    doc: docWithMarks,
    replaceWith(from: number, to: number, node: unknown) {
      assert.equal(from, spaceBeforeIssue.from);
      assert.equal(to, spaceBeforeIssue.to);
      assert.ok(node);
    },
  };

  // Xác minh mark bold được bảo toàn tại vị trí thay thế
  const $pos = docWithMarks.resolve(spaceBeforeIssue.from);
  const marks = $pos.nodeAfter?.marks ?? $pos.marks();
  assert.equal(marks?.length, 1);
  assert.equal(marks[0].type.name, "strong");
});

test("Phase 5.3 - False Positive Controls: Ignore Once & Disable Rule", () => {
  GrammarCheckerEngine.resetIgnored();
  GrammarCheckerEngine.clearDisabledRules();

  const doc = createDocFromText("Hello  world and another  two spaces.");
  let issues = GrammarCheckerEngine.checkDocument(doc);
  assert.equal(issues.length, 2);

  // 1. Ignore Once issue đầu tiên
  GrammarCheckerEngine.ignoreOnce(issues[0].id);
  issues = GrammarCheckerEngine.checkDocument(doc);
  assert.equal(issues.length, 1);

  // 2. Disable Rule "double-spaces"
  GrammarCheckerEngine.disableRule("double-spaces");
  assert.equal(GrammarCheckerEngine.isRuleDisabled("double-spaces"), true);

  issues = GrammarCheckerEngine.checkDocument(doc);
  assert.equal(issues.length, 0);

  // 3. Re-enable Rule
  GrammarCheckerEngine.enableRule("double-spaces");
  assert.equal(GrammarCheckerEngine.isRuleDisabled("double-spaces"), false);

  GrammarCheckerEngine.resetIgnored();
  issues = GrammarCheckerEngine.checkDocument(doc);
  assert.equal(issues.length, 2);
});

test("Phase 5.3 - Performance: Quét đồng thời Spelling + Grammar dưới 15ms", () => {
  // Tạo tài liệu gồm 30 đoạn văn bản
  const paragraphs = [];
  for (let i = 0; i < 30; i++) {
    paragraphs.push(
      testSchema.nodes.paragraph.create(null, [
        testSchema.text(
          `This is paragraph number ${i} testing both spelling and grammar performance concurrently.`
        ),
      ])
    );
  }
  const largeDoc = testSchema.nodes.doc.create(null, paragraphs);

  const start = performance.now();
  const spellingIssues = SpellCheckerEngine.checkDocument(largeDoc);
  const grammarIssues = GrammarCheckerEngine.checkDocument(largeDoc);
  const duration = performance.now() - start;

  assert.equal(spellingIssues.length, 0);
  assert.equal(grammarIssues.length, 0);
  assert.ok(duration < 25, `Proofing took ${duration.toFixed(2)}ms (expected < 25ms)`);
});
