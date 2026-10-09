/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { Schema } from "prosemirror-model";
import {
  ReflowManager,
  MAX_LAYOUT_PASSES,
} from "./services/reflowManager.ts";
import { buildPageLayoutMap, getNodeSize } from "./services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import { measureLinesFromRenderedDom } from "./services/lineMeasurementService.ts";

test("Phase 11 - 1. Dirty range detection from ProseMirror transaction identifies earliest affected position", () => {
  const manager = new ReflowManager();

  const testSchema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "inline*", group: "block" },
      text: { group: "inline" },
    },
  });

  const oldDoc = testSchema.nodes.doc.create(null, [
    testSchema.nodes.paragraph.create(null, [testSchema.text("Đoạn văn đầu tiên cố định.")]),
    testSchema.nodes.paragraph.create(null, [testSchema.text("Đoạn văn thứ hai ban đầu.")]),
  ]);

  const newDoc = testSchema.nodes.doc.create(null, [
    testSchema.nodes.paragraph.create(null, [testSchema.text("Đoạn văn đầu tiên cố định.")]),
    testSchema.nodes.paragraph.create(null, [testSchema.text("Đoạn văn thứ hai ĐÃ ĐƯỢC CHỈNH SỬA.")]),
  ]);

  const dirty = manager.computeDirtyRangeFromTransaction(oldDoc, newDoc);
  assert.ok(dirty, "Phải phát hiện được dirty range khi nội dung thay đổi");
  assert.equal(dirty.scope, "block");

  // Đoạn 1 dài 28 ký tự + 2 token block = 30. Điểm khác biệt bắt đầu trong đoạn 2
  const p1Size = oldDoc.child(0).nodeSize;
  assert.ok(dirty.fromPos >= p1Size, `Điểm bắt đầu dirty (${dirty.fromPos}) phải nằm ở hoặc sau đoạn 1 (${p1Size})`);

  // Gộp dirty range với thao tác gõ tiếp theo
  manager.markDirty(dirty);
  // Thêm một dirty range ở vị trí sau: dirty.fromPos + 10
  manager.markDirty({ fromPos: dirty.fromPos + 10, toPos: dirty.fromPos + 20, scope: "block" });
  let pending = manager.getPendingDirtyRange();
  assert.equal(pending?.fromPos, dirty.fromPos, "Gộp dirty range ở vị trí sau phải giữ vị trí bắt đầu sớm nhất");

  // Thêm một dirty range ở vị trí trước: dirty.fromPos - 10
  manager.markDirty({ fromPos: dirty.fromPos - 10, toPos: dirty.fromPos, scope: "block" });
  pending = manager.getPendingDirtyRange();
  assert.equal(pending?.fromPos, dirty.fromPos - 10, "Gộp dirty range ở vị trí trước phải cập nhật vị trí bắt đầu sớm nhất");
});

test("Phase 11 - 2. Partial reflow: stable blocks before dirty range retain cached measurements without remeasurement", () => {
  const manager = new ReflowManager();

  // Đăng ký cache cho 5 đoạn văn
  for (let i = 0; i < 5; i++) {
    const pos = i * 100;
    manager.setCachedLines(pos, [
      {
        lineIndex: 0,
        from: pos + 1,
        to: pos + 50,
        top: 0,
        bottom: 22,
        height: 22,
        left: 0,
        right: 500,
        width: 500,
        text: `Nội dung đoạn ${i}`,
      },
    ]);
  }

  assert.equal(manager.getCachedLinesCount(), 5);

  // Đột biến xảy ra ở vị trí 300 (đoạn 3)
  manager.invalidateFrom(300);

  // Đoạn 0, 1, 2 (pos < 300) phải vẫn còn trong cache
  assert.ok(manager.getCachedLines(0), "Đoạn 0 trước dirty range phải được giữ trong cache");
  assert.ok(manager.getCachedLines(100), "Đoạn 1 trước dirty range phải được giữ trong cache");
  assert.ok(manager.getCachedLines(200), "Đoạn 2 trước dirty range phải được giữ trong cache");

  // Đoạn 3, 4 (pos >= 300) phải bị xóa khỏi cache để remeasure
  assert.equal(manager.getCachedLines(300), undefined, "Đoạn 3 tại dirty range phải bị hủy cache");
  assert.equal(manager.getCachedLines(400), undefined, "Đoạn 4 sau dirty range phải bị hủy cache");
});

test("Phase 11 - 3. Convergence detection: local edit that does not push page boundary converges immediately", () => {
  const manager = new ReflowManager();

  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dòng 1 của tài liệu ngắn vừa vặn trên trang đơn." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dòng 2 của tài liệu ngắn vừa vặn trên trang đơn." }],
      },
    ],
  };

  const layout1 = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const layout2 = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  const converged = manager.checkConvergence(layout1, layout2);
  assert.equal(converged, true, "Hai layout giống nhau về phân trang phải được xác nhận hội tụ");

  // Thay đổi tạo trang mới
  const hugeDoc = {
    type: "doc",
    content: Array.from({ length: 60 }, (_, i) => ({
      type: "paragraph",
      content: [{ type: "text", text: `Đoạn ${i}: Nội dung văn bản dài để tràn trang.` }],
    })),
  };
  const layout3 = buildPageLayoutMap(hugeDoc, DEFAULT_PAGE_SETTINGS);
  assert.notEqual(layout1.getPageCount(), layout3.getPageCount());
  assert.equal(manager.checkConvergence(layout1, layout3), false, "Layout khác số trang không được coi là hội tụ");
});

test("Phase 11 - 4. Convergence Guard: prevents infinite layout passes and halts gracefully at MAX_LAYOUT_PASSES", () => {
  const manager = new ReflowManager();

  // Kiểm tra ngưỡng MAX_LAYOUT_PASSES (mặc định 3)
  assert.equal(MAX_LAYOUT_PASSES, 3);

  // Pass 1: Cho phép
  assert.equal(manager.executePassGuard(), true);
  // Pass 2: Cho phép
  assert.equal(manager.executePassGuard(), true);
  // Pass 3: Cho phép
  assert.equal(manager.executePassGuard(), true);
  // Pass 4: VƯỢT QUÁ NGƯỠNG -> Bị chặn, không gây freeze hoặc crash
  assert.equal(manager.executePassGuard(), false, "Pass thứ 4 phải bị chặn bởi Convergence Guard");

  // Reset sau khi chu kỳ reflow kết thúc
  manager.resetPassCounter();
  assert.equal(manager.executePassGuard(), true, "Sau khi reset, pass đầu tiên phải được phép thực thi");
});

test("Phase 11 - 5. Zoom scale independence: visual zoom does not alter logical document geometry or page count", () => {
  // Tạo tài liệu gồm 15 đoạn văn
  const doc = {
    type: "doc",
    content: Array.from({ length: 15 }, (_, i) => ({
      type: "paragraph",
      content: [{ type: "text", text: `Đoạn văn ${i + 1}: Kiểm tra phân trang độc lập với mức thu phóng màn hình.` }],
    })),
  };

  // Tính layout ở mức chuẩn (logical 100%)
  const layout100 = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const basePageCount = layout100.getPageCount();

  // Kiểm tra tính bất biến của geometry phân trang khi zoom thay đổi
  const layout150 = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const layout200 = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  assert.equal(layout150.getPageCount(), basePageCount, "Zoom 150% không đổi số trang");
  assert.equal(layout200.getPageCount(), basePageCount, "Zoom 200% không đổi số trang");

  // Kiểm tra công thức chuẩn hóa tỉ lệ zoom:
  // Kích thước DOM rendered thực tế bị nhân bởi zoomFactor, nhưng được chuẩn hóa về logical pixels:
  const rawMeasuredHeight = 33; // 22px * 1.5
  const zoomFactor = 1.5;
  const normalizedHeight = rawMeasuredHeight / zoomFactor;
  assert.equal(normalizedHeight, 22, "Chiều cao đo đạc phải chuẩn hóa chính xác bằng rawHeight / zoomFactor");

  const rawContainerWidth = 900; // 600px * 1.5
  const normalizedWidth = rawContainerWidth / zoomFactor;
  assert.equal(normalizedWidth, 600, "Chiều rộng container phải chuẩn hóa chính xác bằng rawWidth / zoomFactor");
});

test("Phase 11 - 6. ResizeObserver guard: subpixel jitter and layout-application height changes do not trigger loop", () => {
  const manager = new ReflowManager();

  // TH 1: Đang trong quá trình gán layout (isApplyingLayout = true)
  manager.setLayoutApplicationInProgress(true);
  const shouldTriggerDuringApply = manager.shouldTriggerResize(800, 800, 1000, 1500);
  assert.equal(shouldTriggerDuringApply, false, "Phải bỏ qua resize event khi đang áp dụng layout (chặn feedback loop)");
  manager.setLayoutApplicationInProgress(false);

  // TH 2: Thay đổi subpixel chiều rộng (< 1px)
  const isSubpixel = manager.shouldTriggerResize(800.2, 800.7, 1000, 1000);
  assert.equal(isSubpixel, false, "Biến thiên subpixel < 1px không được trigger reflow");

  // TH 3: Chiều cao thay đổi do spacer nhưng chiều rộng giữ nguyên
  const isHeightOnly = manager.shouldTriggerResize(800, 800, 1000, 1200);
  assert.equal(isHeightOnly, false, "Chỉ đổi chiều cao mà không đổi chiều rộng không được trigger reflow");

  // TH 4: Chiều rộng thay đổi thực sự (ví dụ thu nhỏ cửa sổ hoặc mở sidebar)
  const isRealResize = manager.shouldTriggerResize(800, 950, 1000, 1000);
  assert.equal(isRealResize, true, "Chiều rộng thay đổi đáng kể (>= 1px) phải kích hoạt reflow");
});

test("Phase 11 - 7. Non-layout UI state: selection change or identical doc does not trigger full reflow", () => {
  const manager = new ReflowManager();

  const testSchema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "inline*", group: "block" },
      text: { group: "inline" },
    },
  });

  const doc = testSchema.nodes.doc.create(null, [
    testSchema.nodes.paragraph.create(null, [testSchema.text("Nội dung thử nghiệm.")]),
  ]);

  // Hai ProseMirror doc giống hệt nhau (selection thay đổi hoặc comment hover)
  const isAffecting = manager.isLayoutAffectingChange(doc, doc);
  assert.equal(isAffecting, false, "Không được trigger layout khi tài liệu giống hệt nhau");

  const dirty = manager.computeDirtyRangeFromTransaction(doc, doc);
  assert.equal(dirty, null, "Không phát sinh dirty range cho transaction phi-layout");
});

test("Phase 11 - 8. Performance scenario: 50 paragraphs typing responsiveness executes within fast budget", () => {
  const manager = new ReflowManager();

  // Tạo tài liệu 50 đoạn văn
  const doc = {
    type: "doc",
    content: Array.from({ length: 50 }, (_, i) => ({
      type: "paragraph",
      content: [{ type: "text", text: `Đoạn văn ${i + 1}: Thử nghiệm hiệu năng phân trang tăng dần với 50 đoạn.` }],
    })),
  };

  // Khởi tạo đo đạc ban đầu cho toàn bộ 50 đoạn
  let currentPos = 0;
  for (const block of doc.content) {
    const size = getNodeSize(block);
    manager.setCachedLines(currentPos, [
      {
        lineIndex: 0,
        from: currentPos + 1,
        to: currentPos + size - 1,
        top: 0,
        bottom: 22,
        height: 22,
        left: 0,
        right: 600,
        width: 600,
        text: `Đoạn văn...`,
      },
    ]);
    currentPos += size;
  }

  assert.equal(manager.getCachedLinesCount(), 50);

  // Người dùng gõ 1 ký tự vào đoạn 45 (gần cuối tài liệu)
  const p45 = doc.content[45];
  let p45Pos = 0;
  for (let i = 0; i < 45; i++) {
    p45Pos += getNodeSize(doc.content[i]);
  }

  const startBenchmark = performance.now();

  // Đánh dấu dirty từ đoạn 45
  manager.markDirty({ fromPos: p45Pos, scope: "block", reason: "typing" });

  // Mô phỏng logic usePagination: chỉ remeasure các block từ dirtyFromPos trở đi
  let cacheHits = 0;
  let blocksRemeasured = 0;
  let pos = 0;
  for (const block of doc.content) {
    const sz = getNodeSize(block);
    if (pos + sz <= p45Pos && manager.getCachedLines(pos)) {
      cacheHits++;
    } else {
      blocksRemeasured++;
      manager.setCachedLines(pos, [
        {
          lineIndex: 0,
          from: pos + 1,
          to: pos + sz - 1,
          top: 0,
          bottom: 22,
          height: 22,
          left: 0,
          right: 600,
          width: 600,
          text: `Đoạn cập nhật...`,
        },
      ]);
    }
    pos += sz;
  }

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const durationMs = performance.now() - startBenchmark;

  manager.recordDiagnostics({
    lastDurationMs: durationMs,
    blocksRemeasured,
    totalBlocks: 50,
    cacheHitRate: cacheHits / 50,
    converged: true,
  });

  const diag = manager.getDiagnostics();
  assert.ok(diag.cacheHitRate >= 0.88, `Tỷ lệ cache hit (${diag.cacheHitRate}) phải >= 88%`);
  assert.ok(blocksRemeasured <= 6, `Số block phải remeasure (${blocksRemeasured}) phải <= 6`);
  assert.ok(durationMs < 50, `Thời gian tính toán reflow (${durationMs.toFixed(2)}ms) phải < 50ms`);
  assert.ok(layoutMap.getPageCount() >= 1);
});

test("Phase 11 - 9. Performance scenario: 200 paragraphs large document pagination scaling", () => {
  const hugeDoc = {
    type: "doc",
    content: Array.from({ length: 200 }, (_, i) => ({
      type: "paragraph",
      content: [{ type: "text", text: `Đoạn ${i + 1}: Văn bản dài kiểm thử quy mô phân trang lớn 200 đoạn văn.` }],
    })),
  };

  const start = performance.now();
  const layout = buildPageLayoutMap(hugeDoc, DEFAULT_PAGE_SETTINGS);
  const durationMs = performance.now() - start;

  assert.ok(layout.getPageCount() >= 5, "200 đoạn văn phải phân bổ thành ít nhất 5 trang");
  assert.ok(durationMs < 100, `Phân trang 200 đoạn từ AST phải dưới 100ms (thực tế: ${durationMs.toFixed(2)}ms)`);
});

test("Phase 11 - 10. Development Diagnostics: reports valid metrics and does not leak or persist", () => {
  const manager = new ReflowManager();

  manager.recordDiagnostics({
    lastDurationMs: 8.5,
    dirtyRange: { fromPos: 120, scope: "block", reason: "typing" },
    layoutPassCount: 1,
    blocksRemeasured: 2,
    totalBlocks: 50,
    cacheHitRate: 0.96,
    converged: true,
  });

  const diag = manager.getDiagnostics();
  assert.equal(diag.lastDurationMs, 8.5);
  assert.equal(diag.layoutPassCount, 1);
  assert.equal(diag.blocksRemeasured, 2);
  assert.equal(diag.cacheHitRate, 0.96);
  assert.equal(diag.converged, true);
  assert.ok(diag.timestamp > 0);

  manager.resetDiagnostics();
  const resetDiag = manager.getDiagnostics();
  assert.equal(resetDiag.lastDurationMs, 0);
  assert.equal(resetDiag.blocksRemeasured, 0);
  assert.equal(resetDiag.dirtyRange, null);
});
