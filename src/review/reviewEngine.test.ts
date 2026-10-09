import { test } from "node:test";
import assert from "node:assert/strict";

// Imports từ Review Engine
import {
  REVIEW_ITEMS,
  getReviewItemDescriptor,
  getReviewItemsByGroup,
} from "./services/reviewRegistry.ts";
import { useReviewStore } from "../stores/reviewStore.ts";
import { StatisticsService } from "./statistics/statisticsService.ts";
import { ProofingService } from "./proofing/proofingService.ts";
import { CommentService } from "./comments/commentService.ts";
import { TrackChangesService } from "./trackChanges/trackChangesService.ts";
import {
  dispatchReviewCommand,
  openDocumentStatisticsCommand,
  toggleTrackChangesCommand,
} from "./commands/reviewCommands.ts";
import type { JSONContent } from "@tiptap/core";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { createInitialDocument } from "../document/documentModel.ts";

test("Phase 5.1 Review Registry: cấu trúc 5 nhóm chuẩn Office và các descriptor", () => {
  assert.equal(REVIEW_ITEMS.length >= 11, true);

  const proofingItems = getReviewItemsByGroup("proofing");
  assert.equal(proofingItems.length, 2);
  assert.deepEqual(
    proofingItems.map((i) => i.id),
    ["spelling", "grammar"]
  );

  const commentsItems = getReviewItemsByGroup("comments");
  assert.equal(commentsItems.length, 4);
  assert.deepEqual(
    commentsItems.map((i) => i.id),
    ["newComment", "deleteComment", "previousComment", "nextComment"]
  );

  const trackingItems = getReviewItemsByGroup("tracking");
  assert.equal(trackingItems.length, 1);
  assert.equal(trackingItems[0].id, "trackChanges");

  const changesItems = getReviewItemsByGroup("changes");
  assert.equal(changesItems.length, 4);
  assert.deepEqual(
    changesItems.map((i) => i.id),
    ["acceptChange", "rejectChange", "previousChange", "nextChange"]
  );

  const documentItems = getReviewItemsByGroup("document");
  assert.equal(documentItems.length, 1);
  assert.equal(documentItems[0].id, "documentStatistics");
  assert.equal(documentItems[0].status, "active");

  // Kiểm tra descriptor tra cứu
  const spelling = getReviewItemDescriptor("spelling");
  assert.ok(spelling);
  assert.equal(spelling.name, "Chính tả");
  assert.equal(spelling.status, "active");
  assert.equal(spelling.phase, "5.2");

  const docStats = getReviewItemDescriptor("documentStatistics");
  assert.ok(docStats);
  assert.equal(docStats.status, "active");
});

test("Phase 5.1 Review Store: quản lý trạng thái proofing, tracking, comments, modal", () => {
  const store = useReviewStore.getState();
  store.resetReviewState();

  // Giá trị khởi tạo (Phase 5.2: proofing bật mặc định)
  assert.equal(useReviewStore.getState().proofingEnabled, true);
  assert.equal(useReviewStore.getState().trackChangesEnabled, false);
  assert.equal(useReviewStore.getState().activeCommentId, null);
  assert.equal(useReviewStore.getState().activeChangeId, null);
  assert.equal(useReviewStore.getState().isStatisticsModalOpen, false);

  // Toggle proofing
  store.toggleProofing();
  assert.equal(useReviewStore.getState().proofingEnabled, false);
  store.setProofingEnabled(true);
  assert.equal(useReviewStore.getState().proofingEnabled, true);

  // Toggle tracking
  store.toggleTrackChanges();
  assert.equal(useReviewStore.getState().trackChangesEnabled, true);
  store.setTrackChangesEnabled(false);
  assert.equal(useReviewStore.getState().trackChangesEnabled, false);

  // Active items
  store.setActiveCommentId("comment-123");
  assert.equal(useReviewStore.getState().activeCommentId, "comment-123");

  store.setActiveChangeId("change-456");
  assert.equal(useReviewStore.getState().activeChangeId, "change-456");

  // Statistics modal
  store.openStatisticsModal();
  assert.equal(useReviewStore.getState().isStatisticsModalOpen, true);
  store.closeStatisticsModal();
  assert.equal(useReviewStore.getState().isStatisticsModalOpen, false);

  // Reset
  store.resetReviewState();
  assert.equal(useReviewStore.getState().activeCommentId, null);
  assert.equal(useReviewStore.getState().activeChangeId, null);
});

test("Phase 5.1 Statistics Service: tính toán chính xác chỉ số tài liệu từ AST", () => {
  // Test 1: Content rỗng
  const emptyStats = StatisticsService.calculateDetailedStats(null, 1);
  assert.deepEqual(emptyStats, {
    words: 0,
    characters: 0,
    charactersNoSpaces: 0,
    paragraphs: 0,
    pages: 1,
    lines: 0,
  });

  // Test 2: Content phức tạp có tiếng Việt và định dạng
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Báo cáo kiểm thử phần mềm" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đây là đoạn văn bản " },
          { type: "text", marks: [{ type: "bold" }], text: "tiếng Việt có dấu" },
          { type: "text", text: " dùng cho kiểm toán." },
        ],
      },
    ],
  };

  const detailedStats = StatisticsService.calculateDetailedStats(content, 3);
  assert.equal(detailedStats.paragraphs, 2);
  assert.equal(detailedStats.pages, 3);
  // Đoạn 1: 6 từ, Đoạn 2: 13 từ => Tổng 19 từ
  assert.equal(detailedStats.words, 19);
  // Characters with spaces > Characters without spaces
  assert.equal(detailedStats.characters > detailedStats.charactersNoSpaces, true);
  assert.equal(detailedStats.lines >= 2, true);
});

test("Phase 5.1 Subsystem Services: tính độc lập của Proofing, Comments, TrackChanges", () => {
  // Proofing Service (Phase 5.2: Spell Check core is available)
  assert.equal(ProofingService.isProofingAvailable(), true);
  const proofingState = ProofingService.getDefaultState();
  assert.equal(proofingState.proofingEnabled, false);
  assert.equal(proofingState.spellCheckLanguage, "vi-VN");
  assert.equal(ProofingService.getSupportedLanguages().length >= 2, true);

  // Comments Service
  assert.equal(CommentService.canAddComment(10, 20), true);
  assert.equal(CommentService.canAddComment(20, 20), false);
  const commentsSummary = CommentService.getCommentsCount([
    {
      id: "c1",
      author: "Hoang",
      createdAt: new Date().toISOString(),
      range: { from: 0, to: 5 },
      content: "Bình luận 1",
      resolved: false,
    },
    {
      id: "c2",
      author: "Hoang",
      createdAt: new Date().toISOString(),
      range: { from: 10, to: 15 },
      content: "Bình luận 2",
      resolved: true,
    },
  ]);
  assert.equal(commentsSummary.total, 2);
  assert.equal(commentsSummary.active, 1);
  assert.equal(commentsSummary.resolved, 1);

  // Track Changes Service
  const changesSummary = TrackChangesService.getChangesSummary([
    {
      id: "ch1",
      author: "Hoang",
      timestamp: new Date().toISOString(),
      type: "insertion",
      from: 5,
      to: 10,
    },
    {
      id: "ch2",
      author: "Hoang",
      timestamp: new Date().toISOString(),
      type: "deletion",
      from: 15,
      to: 20,
    },
  ]);
  assert.equal(changesSummary.total, 2);
  assert.equal(changesSummary.insertions, 1);
  assert.equal(changesSummary.deletions, 1);
  assert.equal(changesSummary.formatting, 0);
});

test("Phase 5.1 Review Commands: điều phối lệnh an toàn, không làm hỏng state", () => {
  useReviewStore.getState().resetReviewState();

  // Command active: mở statistics modal
  const statsRes = openDocumentStatisticsCommand();
  assert.equal(statsRes.success, true);
  assert.equal(statsRes.itemType, "documentStatistics");
  assert.equal(useReviewStore.getState().isStatisticsModalOpen, true);
  useReviewStore.getState().closeStatisticsModal();

  // Command toggle tracking
  const trackRes = toggleTrackChangesCommand();
  assert.equal(trackRes.success, true);
  assert.equal(trackRes.itemType, "trackChanges");
  assert.equal(useReviewStore.getState().trackChangesEnabled, true);

  // Lệnh active qua dispatcher chung
  const spellingRes = dispatchReviewCommand("spelling");
  assert.equal(spellingRes.success, true);
  assert.equal(spellingRes.itemType, "spelling");

  const commentRes = dispatchReviewCommand("newComment");
  assert.equal(commentRes.success, false);

  const docStatsRes = dispatchReviewCommand("documentStatistics");
  assert.equal(docStatsRes.success, true);
  assert.equal(useReviewStore.getState().isStatisticsModalOpen, true);
});

test("Phase 5.1 Zero-Regression: Document Model, .mwd Persistence & Formatting giữ nguyên", () => {
  const model = createInitialDocument("Tài liệu kiểm thử Phase 5.1");
  model.content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Kiểm tra tính tương thích ngược" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung văn bản không bị xáo trộn." }],
      },
    ],
  };

  // Lưu và mở lại qua .mwd
  const jsonString = serializeDocumentToMwd(model);
  const result = deserializeMwdToDocument(jsonString);

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.document.metadata.title, "Tài liệu kiểm thử Phase 5.1");
    assert.equal(result.document.content.content?.length, 2);
    assert.equal(result.document.pageSettings.paperSize, "A4");
  }
});
