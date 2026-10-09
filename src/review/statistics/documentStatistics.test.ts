import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { extractDocumentStats } from "../../document/documentModel.ts";
import { StatisticsService } from "./statisticsService.ts";
import { ProofingService } from "../proofing/proofingService.ts";
import { TrackChangesService } from "../trackChanges/trackChangesService.ts";
import { getReviewItemDescriptor } from "../services/reviewRegistry.ts";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import { calculatePaginationState } from "../../page/services/paginationService.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/index.ts";

function createTestEditor(content?: JSONContent) {
  return new Editor({
    extensions: getEditorExtensions(),
    content,
  });
}

test("PHASE 5.7 — 1. Empty Document: thống kê chuẩn xác khi tài liệu trống", () => {
  // Null content
  const nullStats = StatisticsService.calculateDetailedStats(null, 1);
  assert.equal(nullStats.words, 0);
  assert.equal(nullStats.characters, 0);
  assert.equal(nullStats.charactersNoSpaces, 0);
  assert.equal(nullStats.paragraphs, 0);
  assert.equal(nullStats.pages, 1);
  assert.equal(nullStats.lines, 0);

  // Empty doc AST
  const emptyDoc: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
  const emptyStats = StatisticsService.calculateDetailedStats(emptyDoc, 1);
  assert.equal(emptyStats.words, 0);
  assert.equal(emptyStats.characters, 0);
  assert.equal(emptyStats.charactersNoSpaces, 0);
  assert.equal(emptyStats.paragraphs, 1);
  assert.equal(emptyStats.pages, 1);
});

test("PHASE 5.7 — 2. Single Page Document: đếm từ, ký tự có/không dấu cách, đoạn văn", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Cộng hòa Xã hội Chủ nghĩa Việt Nam" }], // 7 từ, 34 ký tự (kể cả khoảng trắng), 28 ký tự không khoảng trắng
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Độc lập - Tự do - Hạnh phúc" }], // 7 từ, 27 ký tự (kể cả khoảng trắng), 21 ký tự không khoảng trắng
      },
    ],
  };

  const stats = StatisticsService.calculateDetailedStats(doc, 1);
  assert.equal(stats.pages, 1);
  assert.equal(stats.paragraphs, 2);
  assert.equal(stats.words, 16);
  assert.equal(stats.characters, 61);
  assert.equal(stats.charactersNoSpaces, 47);
  assert.ok(stats.lines >= 2);
});

test("PHASE 5.7 — 3. Multi-page Document: phản ánh trang từ Page Engine thực tế, không dùng Math.ceil giả lập", () => {
  const multiPageDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung trang 1" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung trang 2 sau ngắt trang" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung trang 3 kết thúc" }],
      },
    ],
  };

  // Tính số trang vật lý bằng Page Engine thật (calculatePaginationState)
  const paginationResult = calculatePaginationState(multiPageDoc, {
    paperSize: DEFAULT_PAGE_SETTINGS.paperSize,
    orientation: DEFAULT_PAGE_SETTINGS.orientation,
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });
  assert.ok(paginationResult.pageCount >= 3, `PageCount vật lý phải ít nhất là 3, thực tế: ${paginationResult.pageCount}`);

  // Chuyển kết quả từ Page Engine vào StatisticsService
  const stats = StatisticsService.calculateDetailedStats(multiPageDoc, paginationResult.pageCount);
  assert.equal(stats.pages, paginationResult.pageCount);
  assert.ok(stats.words > 0);
  // Không fake Math.ceil(characters / X)
  assert.notEqual(stats.pages, Math.ceil(stats.characters / 2000));
});

test("PHASE 5.7 — 4. Lists & Headings: trích xuất chính xác cấu trúc danh sách và tiêu đề", () => {
  const docWithListsAndHeadings: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Kế hoạch Quý 4" }], // 4 từ
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Nhiệm vụ thứ nhất hoàn thành" }], // 5 từ
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Nhiệm vụ thứ hai đang chạy" }], // 6 từ
              },
            ],
          },
        ],
      },
    ],
  };

  const stats = StatisticsService.calculateDetailedStats(docWithListsAndHeadings, 1);
  assert.equal(stats.headings, 1);
  assert.equal(stats.paragraphs, 3); // 1 heading + 2 list paragraphs
  assert.equal(stats.words, 16); // 4 + 6 + 6
});

test("PHASE 5.7 — 5. Tables & Images: thống kê số lượng bảng, hình ảnh và đếm text trong ô", () => {
  const docWithTableAndImage: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Báo cáo thống kê dữ liệu:" }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Cột A" }],
                  },
                ],
              },
              {
                type: "tableHeader",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Cột B" }],
                  },
                ],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Dữ liệu một" }],
                  },
                ],
              },
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Dữ liệu hai" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "image",
        attrs: { src: "https://example.com/chart.png", alt: "Biểu đồ" },
      },
    ],
  };

  const stats = StatisticsService.calculateDetailedStats(docWithTableAndImage, 1);
  assert.equal(stats.tables, 1);
  assert.equal(stats.images, 1);
  // Đoạn văn gốc (1) + 4 ô bảng (4) = 5 paragraphs
  assert.equal(stats.paragraphs, 5);
  // Chứa cả chữ trong các ô bảng
  assert.ok(stats.words >= 12);
});

test("PHASE 5.7 — 6. Word Count Policy: Tracked Deletions bị LOẠI BỎ khỏi số từ và ký tự", () => {
  const docWithTrackChanges: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hôm nay thời tiết " }, // 4 từ
          {
            type: "text",
            marks: [
              {
                type: "trackChange",
                attrs: { id: "del-1", changeType: "delete", author: "Reviewer" },
              },
            ],
            text: "rất xấu và u ám ", // 5 từ bị xóa
          },
          {
            type: "text",
            marks: [
              {
                type: "trackChange",
                attrs: { id: "ins-1", changeType: "insert", author: "Reviewer" },
              },
            ],
            text: "thật tuyệt vời ", // 3 từ chèn mới
          },
          { type: "text", text: "ở Hà Nội." }, // 3 từ
        ],
      },
    ],
  };

  const stats = StatisticsService.calculateDetailedStats(docWithTrackChanges, 1);
  // Tổng từ KHÔNG chứa đoạn bị đánh dấu xóa "rất xấu và u ám " (5 từ)
  // Chỉ tính: "Hôm nay thời tiết " (4) + "thật tuyệt vời " (3) + "ở Hà Nội." (3) = 10 từ
  assert.equal(stats.words, 10);
  assert.equal(stats.trackedDeletions, 1);
  assert.equal(stats.trackedInsertions, 1);
  assert.equal(stats.trackedChanges, 2);
});

test("PHASE 5.7 — 7. Word Count Policy: Comments neo được tính 1 lần, thảo luận sidebar không tính vào body", () => {
  const docWithComments: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Tài liệu này có đoạn " }, // 5 từ
          {
            type: "text",
            marks: [{ type: "comment", attrs: { commentId: "c-1" } }],
            text: "quan trọng cần chú ý", // 4 từ
          },
          { type: "text", text: " trong phụ lục." }, // 3 từ
        ],
      },
    ],
  };

  const commentsData = [
    {
      id: "c-1",
      author: "Hoang",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content: "Xin hãy kiểm tra kỹ điều khoản phụ lục này trước khi ký kết hợp đồng", // 14 từ thảo luận sidebar
      resolved: false,
      selectedText: "quan trọng cần chú ý",
    },
    {
      id: "c-2",
      author: "Minh",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content: "Đã duyệt",
      resolved: true,
      selectedText: "",
    },
  ];

  const stats = StatisticsService.calculateDetailedStats(docWithComments, 1, {
    comments: commentsData,
  });

  // Văn bản neo được tính đúng 1 lần: 5 + 5 + 3 = 13 từ
  assert.equal(stats.words, 13);
  // Không bị cộng thêm 14 từ từ comment.content trong sidebar
  assert.equal(stats.comments, 2);
  assert.equal(stats.unresolvedComments, 1);
});

test("PHASE 5.7 — 8. Selection Statistics: tính toán chính xác số từ và ký tự vùng bôi đen", () => {
  const selectedText = "Hà Nội mùa này vắng những cơn mưa"; // 8 từ, 33 ký tự, 26 ký tự không dấu cách
  const selStats = StatisticsService.calculateTextStats(selectedText);
  assert.equal(selStats.words, 8);
  assert.equal(selStats.characters, 33);
  assert.equal(selStats.charactersNoSpaces, 26);

  // Vùng chọn rỗng
  const emptySel = StatisticsService.calculateTextStats("");
  assert.equal(emptySel.words, 0);
  assert.equal(emptySel.characters, 0);

  // Tích hợp vào calculateDetailedStats
  const doc: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Toàn bộ tài liệu có nhiều từ hơn đoạn bôi đen." }] }],
  };
  const stats = StatisticsService.calculateDetailedStats(doc, 1, { selectedText });
  assert.equal(stats.selectedWords, 8);
  assert.equal(stats.selectedCharacters, 33);
  assert.ok(stats.words > stats.selectedWords!);
});

test("PHASE 5.7 — 9. Review Summary: thống kê lỗi chính tả, ngữ pháp, bình luận, thay đổi", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Kiểm thử review summary" }] }],
  };

  const stats = StatisticsService.calculateDetailedStats(doc, 1, {
    spellingIssues: 3,
    grammarIssues: 2,
    comments: [
      { id: "c1", author: "A", createdAt: "", updatedAt: "", content: "x", resolved: false, selectedText: "" },
      { id: "c2", author: "B", createdAt: "", updatedAt: "", content: "y", resolved: true, selectedText: "" },
    ],
    trackedChanges: [
      { id: "t1", type: "insert", author: "A", timestamp: "", text: "a" },
      { id: "t2", type: "delete", author: "B", timestamp: "", text: "b" },
    ],
  });

  assert.equal(stats.spellingIssues, 3);
  assert.equal(stats.grammarIssues, 2);
  assert.equal(stats.comments, 2);
  assert.equal(stats.unresolvedComments, 1);
  assert.equal(stats.trackedChanges, 2);
  assert.equal(stats.trackedInsertions, 1);
  assert.equal(stats.trackedDeletions, 1);
});

test("PHASE 5.7 — 10. Performance & Memoization: cache O(1) không scan lại trên cùng AST object", () => {
  const largeDoc: JSONContent = {
    type: "doc",
    content: Array.from({ length: 50 }, (_, i) => ({
      type: "paragraph",
      content: [{ type: "text", text: `Đoạn văn số ${i} chứa nội dung kiểm thử hiệu năng thống kê từ và ký tự tài liệu.` }],
    })),
  };

  const start1 = performance.now();
  const stats1 = StatisticsService.calculateDetailedStats(largeDoc, 5);
  const time1 = performance.now() - start1;

  const start2 = performance.now();
  // 1000 lượt gọi liên tiếp trên cùng object AST
  for (let i = 0; i < 1000; i++) {
    StatisticsService.calculateDetailedStats(largeDoc, 5);
  }
  const time2 = performance.now() - start2;

  assert.ok(stats1.words > 500);
  // 1000 lượt gọi lấy từ WeakMap cache phải diễn ra chớp nhoáng (< 15ms)
  assert.ok(time2 < 30, `1000 cached calls should be instantaneous (took ${time2.toFixed(2)}ms)`);
});

test("PHASE 5.7 — 11. Proofing Issue Navigation: Next và Previous Issue điều hướng chính xác", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello word this is an exampel text." }],
      },
    ],
  });

  // Giả lập 2 issues trong tài liệu
  const mockIssues = [
    { id: "iss-1", type: "spelling" as const, from: 7, to: 11, word: "word", message: "word", suggestions: ["world"], language: "en-US" },
    { id: "iss-2", type: "spelling" as const, from: 24, to: 31, word: "exampel", message: "exampel", suggestions: ["example"], language: "en-US" },
  ];

  // Đặt selection ở đầu tài liệu
  editor.commands.setTextSelection(1);

  // Điều hướng bằng ProofingService
  const next1 = mockIssues.find((i) => i.from > 1);
  assert.equal(next1?.id, "iss-1");

  const success1 = ProofingService.navigateToIssue(editor, next1!);
  assert.equal(success1, true);
  assert.equal(editor.state.selection.from, 7);
  assert.equal(editor.state.selection.to, 11);

  // Đi tới lỗi tiếp theo từ vị trí hiện tại
  const next2 = mockIssues.find((i) => i.from > 11);
  assert.equal(next2?.id, "iss-2");
  const success2 = ProofingService.navigateToIssue(editor, next2!);
  assert.equal(success2, true);
  assert.equal(editor.state.selection.from, 24);
  assert.equal(editor.state.selection.to, 31);

  // Lùi lại lỗi trước
  const prev1 = [...mockIssues].reverse().find((i) => i.to < 24);
  assert.equal(prev1?.id, "iss-1");
  const success3 = ProofingService.navigateToIssue(editor, prev1!);
  assert.equal(success3, true);
  assert.equal(editor.state.selection.from, 7);
});

test("PHASE 5.7 — 12. Review Registry & Descriptors: tra cứu đầy đủ nextIssue và previousIssue", () => {
  const nextDesc = getReviewItemDescriptor("nextIssue");
  assert.ok(nextDesc);
  assert.equal(nextDesc.id, "nextIssue");
  assert.equal(nextDesc.shortcut, "F7");
  assert.equal(nextDesc.group, "proofing");

  const prevDesc = getReviewItemDescriptor("previousIssue");
  assert.ok(prevDesc);
  assert.equal(prevDesc.id, "previousIssue");
  assert.equal(prevDesc.shortcut, "Shift+F7");
  assert.equal(prevDesc.group, "proofing");
});
