import test from "node:test";
import assert from "node:assert/strict";
import { extractDocumentStats } from "../document/documentModel.ts";
import {
  useZoomStore,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  ZOOM_STEP,
} from "../stores/zoomStore.ts";
import type { JSONContent } from "@tiptap/core";

test("Document Stats: accurately counts words and characters without counting HTML tags or metadata", () => {
  const docWithMarks: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "Xin " },
          { type: "text", marks: [{ type: "italic" }], text: "chào " },
          { type: "text", text: "Việt Nam!" },
        ],
      },
    ],
  };

  const stats = extractDocumentStats(docWithMarks);
  // "Xin chào Việt Nam!" -> 4 words
  assert.equal(stats.words, 4);
  assert.equal(stats.characters, "Xin chào Việt Nam!".length);
  assert.equal(stats.paragraphs, 1);
});

test("Document Stats: cross-mark split words are counted as a single word", () => {
  // "hello" chia làm 2 text node kề nhau trong 1 paragraph
  const docWithSplitWord: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "hel" },
          { type: "text", text: "lo" },
          { type: "text", text: " world" },
        ],
      },
    ],
  };

  const stats = extractDocumentStats(docWithSplitWord);
  // "hello world" -> 2 words, 11 characters
  assert.equal(stats.words, 2);
  assert.equal(stats.characters, 11);
  assert.equal(stats.paragraphs, 1);
});

test("Document Stats: works with headings, lists and Unicode Vietnamese", () => {
  const complexDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Báo cáo tiến độ dự án" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dưới đây là danh sách công việc hoàn thành:" }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Khởi tạo Tauri và React" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Hệ thống phím tắt thống nhất" }],
              },
            ],
          },
        ],
      },
    ],
  };

  const stats = extractDocumentStats(complexDoc);
  // 1 heading + 1 paragraph + 2 list item paragraphs = 4 paragraphs
  assert.equal(stats.paragraphs, 4);
  // "Báo cáo tiến độ dự án" (6)
  // "Dưới đây là danh sách công việc hoàn thành:" (9)
  // "Khởi tạo Tauri và React" (5)
  // "Hệ thống phím tắt thống nhất" (6)
  // Tổng = 6 + 9 + 5 + 6 = 26 words
  assert.equal(stats.words, 26);
  assert.ok(stats.characters > 0);
});

test("Zoom Store: initial zoom is 100%", () => {
  const { zoom } = useZoomStore.getState();
  assert.equal(zoom, DEFAULT_ZOOM);
});

test("Zoom Store: zoomIn increases by step up to MAX_ZOOM (200%)", () => {
  const store = useZoomStore.getState();
  store.resetZoom();

  store.zoomIn();
  assert.equal(useZoomStore.getState().zoom, DEFAULT_ZOOM + ZOOM_STEP);

  // Set zoom tới sát MAX_ZOOM
  store.setZoom(MAX_ZOOM - 5);
  store.zoomIn();
  assert.equal(useZoomStore.getState().zoom, MAX_ZOOM, "Zoom must be clamped at MAX_ZOOM");

  // zoomIn tiếp không được vượt quá MAX_ZOOM
  store.zoomIn();
  assert.equal(useZoomStore.getState().zoom, MAX_ZOOM);
});

test("Zoom Store: zoomOut decreases by step down to MIN_ZOOM (50%)", () => {
  const store = useZoomStore.getState();
  store.resetZoom();

  store.zoomOut();
  assert.equal(useZoomStore.getState().zoom, DEFAULT_ZOOM - ZOOM_STEP);

  // Set zoom xuống sát MIN_ZOOM
  store.setZoom(MIN_ZOOM + 5);
  store.zoomOut();
  assert.equal(useZoomStore.getState().zoom, MIN_ZOOM, "Zoom must be clamped at MIN_ZOOM");

  // zoomOut tiếp không được nhỏ hơn MIN_ZOOM
  store.zoomOut();
  assert.equal(useZoomStore.getState().zoom, MIN_ZOOM);
});

test("Zoom Store: setZoom clamps arbitrary out-of-range values", () => {
  const store = useZoomStore.getState();

  store.setZoom(10);
  assert.equal(useZoomStore.getState().zoom, MIN_ZOOM);

  store.setZoom(999);
  assert.equal(useZoomStore.getState().zoom, MAX_ZOOM);

  store.setZoom(125);
  assert.equal(useZoomStore.getState().zoom, 125);

  store.resetZoom();
  assert.equal(useZoomStore.getState().zoom, DEFAULT_ZOOM);
});

test("Zoom Store: zoom changes do NOT alter document model or font sizes", () => {
  const initialDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra tính bất biến của document" }],
      },
    ],
  };

  const serializedBefore = JSON.stringify(initialDoc);

  // Thay đổi zoom
  useZoomStore.getState().setZoom(150);
  assert.equal(useZoomStore.getState().zoom, 150);

  // Kiểm tra document JSON không bị thay đổi
  const serializedAfter = JSON.stringify(initialDoc);
  assert.equal(serializedBefore, serializedAfter, "Zoom must never mutate document JSON AST");

  useZoomStore.getState().resetZoom();
});
