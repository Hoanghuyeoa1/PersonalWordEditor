import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import { buildPageLayoutMap } from "./services/pageLayoutMap.ts";
import {
  measureLinesVirtual,
  extractParagraphTextSpans,
  type RenderedLineBox,
} from "./services/lineMeasurementService.ts";

test("Paragraph Flow 1: Short paragraph fits on one page and produces exactly one fragment", () => {
  const shortDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn ngắn gọn chỉ có một dòng duy nhất." }],
      },
    ],
  };

  const map = buildPageLayoutMap(shortDoc, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(map.getPageCount(), 1);

  const frags = map.getAllFragments();
  assert.strictEqual(frags.length, 1);
  assert.strictEqual(frags[0].pageIndex, 0);
  assert.strictEqual(frags[0].continuedFromPreviousPage, false);
  assert.strictEqual(frags[0].continuesToNextPage, false);
  assert.strictEqual(frags[0].from, 0);
  assert.strictEqual(frags[0].to, 45); // 0 + 43 chars + 2
});

test("Paragraph Flow 2: Paragraph exactly near page end splits lines across page boundary", () => {
  // Giả lập trang 1 đã gần đầy: còn trống khoảng 40px (vừa 1 dòng 22px, không vừa dòng 2)
  const lineProvider = (node: JSONContent, _usableWidth: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 34,
          top: 0,
          bottom: 900,
          height: 900,
          left: 0,
          right: 500,
          width: 500,
          text: "Khối chiếm chỗ gần hết trang 1...",
        },
      ];
    }
    return [
      {
        lineIndex: 0,
        from: blockPos + 1,
        to: blockPos + 30,
        top: 0,
        bottom: 22,
        height: 22,
        left: 0,
        right: 500,
        width: 500,
        text: "Dòng 1 nằm ở cuối trang 1",
      },
      {
        lineIndex: 1,
        from: blockPos + 30,
        to: blockPos + 60,
        top: 22,
        bottom: 44,
        height: 22,
        left: 0,
        right: 500,
        width: 500,
        text: "Dòng 2 bị đẩy sang trang 2",
      },
    ];
  };

  // Tạo một block giả chiếm gần hết trang 1 (900px trên tổng số 931px usable)
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối chiếm chỗ gần hết trang 1..." }],
      },
      {
        type: "paragraph",
        attrs: { widowControl: false },
        content: [{ type: "text", text: "Đoạn văn bị ngắt dòng 1 ở trang 1 và dòng 2 ở trang 2." }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
  });

  assert.strictEqual(map.getPageCount(), 2);

  const allFrags = map.getAllFragments();
  // block đầu: 1 frag, block 2: 2 frags -> tổng cộng 3 frags
  assert.strictEqual(allFrags.length, 3);

  const fragPage1 = allFrags[1];
  const fragPage2 = allFrags[2];

  assert.strictEqual(fragPage1.pageIndex, 0);
  assert.strictEqual(fragPage1.continuedFromPreviousPage, false);
  assert.strictEqual(fragPage1.continuesToNextPage, true);

  assert.strictEqual(fragPage2.pageIndex, 1);
  assert.strictEqual(fragPage2.continuedFromPreviousPage, true);
  assert.strictEqual(fragPage2.continuesToNextPage, false);

  // Tính liên tục: kết thúc frag 1 phải bằng bắt đầu frag 2
  assert.strictEqual(fragPage1.to, fragPage2.from);
});

test("Paragraph Flow 3: Paragraph spanning 2 pages produces 2 fragments with continuous positions", () => {
  // Đoạn văn dài tạo khoảng 65 dòng văn bản (~1400px > 931px usable height của A4)
  const paragraphText = "Đây là văn bản thử nghiệm đoạn văn dài tràn qua hai trang giấy vật lý. ".repeat(70);
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: paragraphText }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  assert.strictEqual(map.getPageCount(), 2);

  const frags = map.getAllFragments();
  assert.strictEqual(frags.length, 2);

  assert.strictEqual(frags[0].pageIndex, 0);
  assert.strictEqual(frags[0].continuedFromPreviousPage, false);
  assert.strictEqual(frags[0].continuesToNextPage, true);

  assert.strictEqual(frags[1].pageIndex, 1);
  assert.strictEqual(frags[1].continuedFromPreviousPage, true);
  assert.strictEqual(frags[1].continuesToNextPage, false);

  // Không có khe hở vị trí: frag[0].to === frag[1].from
  assert.strictEqual(frags[0].to, frags[1].from);

  // Vị trí con trỏ map đúng trang
  assert.strictEqual(map.getPageForPosition(frags[0].from), 0);
  assert.strictEqual(map.getPageForPosition(frags[0].to - 1), 0);
  assert.strictEqual(map.getPageForPosition(frags[1].from), 1);
  assert.strictEqual(map.getPageForPosition(frags[1].to), 1);
});

test("Paragraph Flow 4: Paragraph spanning 3+ pages produces sequential continuous fragments", () => {
  // Đoạn văn cực dài tạo khoảng 100 dòng văn bản (~2200px -> ~3 trang A4)
  const longText = "Nội dung văn bản dài kiểm tra phân mảnh qua ba trang liên tiếp trong bộ máy phân trang 2.0. ".repeat(80);
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: longText }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  assert.ok(map.getPageCount() >= 3, `Expected at least 3 pages, got ${map.getPageCount()}`);

  const frags = map.getAllFragments();
  assert.ok(frags.length >= 3);

  // Fragment 0 (Trang 1)
  assert.strictEqual(frags[0].pageIndex, 0);
  assert.strictEqual(frags[0].continuedFromPreviousPage, false);
  assert.strictEqual(frags[0].continuesToNextPage, true);

  // Fragment giữa (Trang 2)
  assert.strictEqual(frags[1].pageIndex, 1);
  assert.strictEqual(frags[1].continuedFromPreviousPage, true);
  assert.strictEqual(frags[1].continuesToNextPage, true);
  assert.strictEqual(frags[0].to, frags[1].from);

  // Fragment cuối
  const lastFrag = frags[frags.length - 1];
  assert.strictEqual(lastFrag.continuedFromPreviousPage, true);
  assert.strictEqual(lastFrag.continuesToNextPage, false);
});

test("Paragraph Flow 5: Mixed font sizes and direct formatting lines", () => {
  const mixedDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "textStyle", attrs: { fontSize: "24pt" } }],
            text: "Tiêu đề phụ chữ lớn 24pt trong đoạn văn. ",
          },
          {
            type: "text",
            marks: [{ type: "textStyle", attrs: { fontSize: "11pt" } }],
            text: "Tiếp nối là văn bản thường 11pt giải thích chi tiết vấn đề liên quan. ",
          },
        ],
      },
    ],
  };

  const spans = extractParagraphTextSpans(mixedDoc.content![0], 0);
  assert.strictEqual(spans.length, 2);
  assert.strictEqual(spans[0].fontSizePx, 32); // 24pt * 96/72 = 32px
  assert.strictEqual(spans[1].fontSizePx, (11 * 96) / 72);

  const lines = measureLinesVirtual(mixedDoc.content![0], 600, 0);
  assert.ok(lines.length >= 1);
  assert.ok(lines[0].height >= 32); // Chiều cao dòng phản ánh font size lớn
});

test("Paragraph Flow 6: Inline marks (bold, italic, strike, underline) preserve continuity", () => {
  const formattedDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "bold" }],
            text: "Văn bản in đậm. ",
          },
          {
            type: "text",
            marks: [{ type: "italic" }],
            text: "Văn bản in nghiêng. ",
          },
          {
            type: "text",
            marks: [{ type: "strike" }],
            text: "Văn bản gạch ngang. ",
          },
        ],
      },
    ],
  };

  const lines = measureLinesVirtual(formattedDoc.content![0], 600, 0);
  assert.ok(lines.length >= 1);

  // Kiểm tra from/to phủ đúng toàn bộ nội dung text
  assert.strictEqual(lines[0].from, 1);
  const totalChars = "Văn bản in đậm. Văn bản in nghiêng. Văn bản gạch ngang. ".length;
  assert.strictEqual(lines[lines.length - 1].to, 1 + totalChars);
});

test("Paragraph Flow 7: Unicode Vietnamese text with accents and tone marks", () => {
  const vietnameseText =
    "Cộng hòa Xã hội Chủ nghĩa Việt Nam. Độc lập - Tự do - Hạnh phúc. " +
    "Lời mở đầu bản Tuyên ngôn Độc lập khẳng định quyền tự do, bình đẳng của mọi dân tộc trên thế giới. ".repeat(15);

  const vnDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: vietnameseText }],
      },
    ],
  };

  const map = buildPageLayoutMap(vnDoc, DEFAULT_PAGE_SETTINGS);
  assert.ok(map.getPageCount() >= 1);

  const frags = map.getAllFragments();
  for (let i = 0; i < frags.length - 1; i++) {
    assert.strictEqual(
      frags[i].to,
      frags[i + 1].from,
      `Fragment ${i} to must equal Fragment ${i + 1} from in Vietnamese text`
    );
  }
});

test("Paragraph Flow 8: Huge paragraph (10,000+ characters) safety and performance", () => {
  // Tạo đoạn văn bản khổng lồ 15,000 ký tự
  const sampleSentence = "Đoạn văn bản kiểm tra độ an toàn khi xử lý đoạn văn khổng lồ vượt qua nhiều trang giấy. ";
  const repeatCount = Math.ceil(15000 / sampleSentence.length);
  const hugeText = sampleSentence.repeat(repeatCount);

  assert.ok(hugeText.length >= 15000);

  const hugeDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: hugeText }],
      },
    ],
  };

  const startTime = Date.now();
  const map = buildPageLayoutMap(hugeDoc, DEFAULT_PAGE_SETTINGS);
  const durationMs = Date.now() - startTime;

  // Hiệu năng: xử lý 15,000 ký tự phải hoàn tất nhanh (< 50ms)
  assert.ok(durationMs < 100, `Execution took ${durationMs}ms, expected < 100ms`);

  // Trang phải tạo hợp lý (~4 - 6 trang), không runaway
  const pageCount = map.getPageCount();
  assert.ok(pageCount >= 4 && pageCount <= 8, `Page count ${pageCount} outside expected range [4, 8]`);

  const frags = map.getAllFragments();
  assert.strictEqual(frags.length, pageCount);

  // Kiểm tra không bị lặp vị trí hoặc mất ký tự
  assert.strictEqual(frags[0].from, 0);
  assert.strictEqual(frags[frags.length - 1].to, hugeText.length + 2);

  for (let i = 0; i < frags.length - 1; i++) {
    assert.strictEqual(
      frags[i].to,
      frags[i + 1].from,
      `Continuity invariant failed at fragment ${i}`
    );
    assert.strictEqual(frags[i].pageIndex, i);
    assert.strictEqual(frags[i].continuesToNextPage, true);
    assert.strictEqual(frags[i + 1].continuedFromPreviousPage, true);
  }
});

test("Paragraph Flow 9: AST Immutability - AST is strictly unchanged after paragraph splitting", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Đoạn văn dài kiểm tra tính bất biến của AST. ".repeat(100),
          },
        ],
      },
    ],
  };

  const astStringBefore = JSON.stringify(doc);

  // Thực thi build layout map phân mảnh qua nhiều trang
  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.ok(map.getPageCount() >= 2);

  const astStringAfter = JSON.stringify(doc);

  // Bắt buộc: AST không bị thay đổi, không bị chèn node mới, không sinh ra paragraphPage1/paragraphPage2
  assert.strictEqual(
    astStringBefore,
    astStringAfter,
    "AST JSON must remain 100% strictly unchanged after paragraph fragmentation"
  );
  assert.strictEqual(doc.content!.length, 1);
  assert.strictEqual(doc.content![0].type, "paragraph");
});
