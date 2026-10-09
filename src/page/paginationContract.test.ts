import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptRuntimeModelToLegacyPagination,
  type RuntimeLayoutModel,
  type RuntimePageBox,
} from "./types/paginationEngine2Contract.ts";

test("Pagination 2.0 Contract: Invariant verification and Runtime Model Structure", () => {
  const dummyPage1: RuntimePageBox = {
    pageNumber: 1,
    sectionIndex: 1,
    sectionId: "sec-1",
    paperSize: "A4",
    orientation: "portrait",
    dimensionsMm: { width: 210, height: 297 },
    marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    topPx: 0,
    bottomPx: 1123,
    heightPx: 1123,
    widthPx: 794,
    contentRectPx: {
      left: 96,
      top: 96,
      width: 602,
      height: 931,
      right: 698,
      bottom: 1027,
    },
    docRange: { from: 0, to: 50 },
  };

  const dummyPage2: RuntimePageBox = {
    pageNumber: 2,
    sectionIndex: 1,
    sectionId: "sec-1",
    paperSize: "A4",
    orientation: "portrait",
    dimensionsMm: { width: 210, height: 297 },
    marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    topPx: 1147,
    bottomPx: 2270,
    heightPx: 1123,
    widthPx: 794,
    contentRectPx: {
      left: 96,
      top: 1243,
      width: 602,
      height: 931,
      right: 698,
      bottom: 2174,
    },
    docRange: { from: 51, to: 120 },
  };

  const model: RuntimeLayoutModel = {
    version: 1,
    timestamp: Date.now(),
    pageCount: 2,
    pages: [dummyPage1, dummyPage2],
    blockBoxes: [],
    isRealDomMeasured: true,
    error: null,
  };

  assert.strictEqual(model.pageCount, 2);
  assert.strictEqual(model.pages.length, 2);
  assert.strictEqual(model.pages[0].pageNumber, 1);
  assert.strictEqual(model.pages[1].pageNumber, 2);
});

test("Pagination 2.0 Contract: adaptRuntimeModelToLegacyPagination adapter preserves backward compatibility", () => {
  const dummyPage1: RuntimePageBox = {
    pageNumber: 1,
    sectionIndex: 1,
    sectionId: "sec-1",
    paperSize: "A4",
    orientation: "portrait",
    dimensionsMm: { width: 210, height: 297 },
    marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    topPx: 0,
    bottomPx: 1123,
    heightPx: 1123,
    widthPx: 794,
    contentRectPx: {
      left: 96,
      top: 96,
      width: 602,
      height: 931,
      right: 698,
      bottom: 1027,
    },
    docRange: { from: 0, to: 50 },
  };

  const model: RuntimeLayoutModel = {
    version: 1,
    timestamp: Date.now(),
    pageCount: 1,
    pages: [dummyPage1],
    blockBoxes: [],
    isRealDomMeasured: true,
  };

  const legacyState = adaptRuntimeModelToLegacyPagination(model, 1, 1);

  assert.strictEqual(legacyState.pageCount, 1);
  assert.strictEqual(legacyState.currentPage, 1);
  assert.strictEqual(legacyState.currentSectionIndex, 1);
  assert.strictEqual(legacyState.pages.length, 1);
  assert.strictEqual(legacyState.usableWidthPx, 602);
  assert.strictEqual(legacyState.usableHeightPx, 931);
  assert.strictEqual(legacyState.pageWidthPx, 794);
  assert.strictEqual(legacyState.pageHeightPx, 1123);
  assert.strictEqual(legacyState.pages[0].widthMm, 210);
  assert.strictEqual(legacyState.pages[0].heightMm, 297);
});
