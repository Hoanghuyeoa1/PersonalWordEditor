import test from "node:test";
import assert from "node:assert/strict";
import {
  PAPER_DIMENSIONS,
  MARGIN_PRESETS,
  DEFAULT_PAGE_SETTINGS,
  SUPPORTED_PAPER_SIZES,
} from "./services/pageConstants.ts";
import {
  getPageDimensions,
  isValidPaperSize,
  isValidOrientation,
  isValidMargins,
  detectMarginPreset,
  validateAndNormalizePageSettings,
  mmToPt,
  mmToPx,
  mmToCss,
  getPageCssVariables,
} from "./services/pageSettingsService.ts";
import {
  createInitialDocument,
  isValidDocumentModel,
  updateDocumentPageSettings,
} from "../document/documentModel.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import type { PageSettings, PageMargins } from "./types/pageTypes.ts";
import type { DocumentModel } from "../document/documentTypes.ts";

test("Page Constants: supports A4, A3, Letter, Legal with accurate mm dimensions", () => {
  assert.equal(PAPER_DIMENSIONS.A4.width, 210);
  assert.equal(PAPER_DIMENSIONS.A4.height, 297);

  assert.equal(PAPER_DIMENSIONS.A3.width, 297);
  assert.equal(PAPER_DIMENSIONS.A3.height, 420);

  assert.equal(PAPER_DIMENSIONS.Letter.width, 215.9);
  assert.equal(PAPER_DIMENSIONS.Letter.height, 279.4);

  assert.equal(PAPER_DIMENSIONS.Legal.width, 215.9);
  assert.equal(PAPER_DIMENSIONS.Legal.height, 355.6);

  assert.deepEqual(SUPPORTED_PAPER_SIZES, ["A4", "A3", "Letter", "Legal"]);
});

test("Page Constants: margin presets Normal, Narrow, Wide use accurate mm units", () => {
  // Normal: 1 inch = 25.4 mm on all sides
  assert.equal(MARGIN_PRESETS.Normal.top, 25.4);
  assert.equal(MARGIN_PRESETS.Normal.right, 25.4);
  assert.equal(MARGIN_PRESETS.Normal.bottom, 25.4);
  assert.equal(MARGIN_PRESETS.Normal.left, 25.4);

  // Narrow: 0.5 inch = 12.7 mm on all sides
  assert.equal(MARGIN_PRESETS.Narrow.top, 12.7);
  assert.equal(MARGIN_PRESETS.Narrow.right, 12.7);
  assert.equal(MARGIN_PRESETS.Narrow.bottom, 12.7);
  assert.equal(MARGIN_PRESETS.Narrow.left, 12.7);

  // Wide: 1.0 inch (25.4 mm) top/bottom, 2.0 inch (50.8 mm) left/right
  assert.equal(MARGIN_PRESETS.Wide.top, 25.4);
  assert.equal(MARGIN_PRESETS.Wide.right, 50.8);
  assert.equal(MARGIN_PRESETS.Wide.bottom, 25.4);
  assert.equal(MARGIN_PRESETS.Wide.left, 50.8);
});

test("Page Dimensions Calculation: swaps width and height in landscape orientation", () => {
  const portraitA4 = getPageDimensions("A4", "portrait");
  assert.equal(portraitA4.width, 210);
  assert.equal(portraitA4.height, 297);

  const landscapeA4 = getPageDimensions("A4", "landscape");
  assert.equal(landscapeA4.width, 297);
  assert.equal(landscapeA4.height, 210);

  const portraitLetter = getPageDimensions("Letter", "portrait");
  assert.equal(portraitLetter.width, 215.9);
  assert.equal(portraitLetter.height, 279.4);

  const landscapeLetter = getPageDimensions("Letter", "landscape");
  assert.equal(landscapeLetter.width, 279.4);
  assert.equal(landscapeLetter.height, 215.9);
});

test("Page Settings Validation: accepts valid and rejects/normalizes invalid inputs", () => {
  assert.equal(isValidPaperSize("A4"), true);
  assert.equal(isValidPaperSize("A3"), true);
  assert.equal(isValidPaperSize("B5"), false);
  assert.equal(isValidPaperSize(123), false);

  assert.equal(isValidOrientation("portrait"), true);
  assert.equal(isValidOrientation("landscape"), true);
  assert.equal(isValidOrientation("diagonal"), false);

  const validMargins: PageMargins = { top: 20, right: 20, bottom: 20, left: 20 };
  assert.equal(isValidMargins(validMargins), true);

  // Margins cannot be negative or NaN
  assert.equal(isValidMargins({ top: -5, right: 20, bottom: 20, left: 20 }), false);
  assert.equal(isValidMargins({ top: NaN, right: 20, bottom: 20, left: 20 }), false);
  assert.equal(isValidMargins(null), false);
});

test("Page Settings Normalization: gracefully handles missing and corrupt page settings", () => {
  // Empty or null returns DEFAULT_PAGE_SETTINGS
  const normalizedNull = validateAndNormalizePageSettings(null);
  assert.equal(normalizedNull.paperSize, "A4");
  assert.equal(normalizedNull.orientation, "portrait");
  assert.deepEqual(normalizedNull.margins, MARGIN_PRESETS.Normal);
  assert.equal(normalizedNull.marginPreset, "Normal");

  // Invalid paperSize falls back to A4
  const invalidSize = validateAndNormalizePageSettings({
    paperSize: "UnknownSize",
    orientation: "landscape",
    margins: MARGIN_PRESETS.Narrow,
  });
  assert.equal(invalidSize.paperSize, "A4");
  assert.equal(invalidSize.orientation, "landscape");
  assert.equal(invalidSize.marginPreset, "Narrow");

  // Detects custom margins correctly
  const customMargins = validateAndNormalizePageSettings({
    paperSize: "Legal",
    orientation: "portrait",
    margins: { top: 30, right: 15, bottom: 30, left: 15 },
  });
  assert.equal(customMargins.paperSize, "Legal");
  assert.equal(customMargins.marginPreset, "Custom");
});

test("Unit Conversion Helpers: mmToPt, mmToPx, mmToCss, getPageCssVariables", () => {
  // 25.4 mm = exactly 72 pt (1 inch)
  assert.equal(mmToPt(25.4), 72);
  // 25.4 mm at 96 DPI = exactly 96 px
  assert.equal(mmToPx(25.4, 96), 96);
  assert.equal(mmToCss(210), "210mm");

  const cssVars = getPageCssVariables({
    paperSize: "A4",
    orientation: "portrait",
    margins: MARGIN_PRESETS.Normal,
  });
  assert.equal(cssVars["--page-width"], "210mm");
  assert.equal(cssVars["--page-height"], "297mm");
  assert.equal(cssVars["--page-margin-top"], "25.4mm");
  assert.equal(cssVars["--page-margin-right"], "25.4mm");
  assert.equal(cssVars["--page-margin-bottom"], "25.4mm");
  assert.equal(cssVars["--page-margin-left"], "25.4mm");
});

test("Document Model: new documents initialize with default PageSettings", () => {
  const doc = createInitialDocument();
  assert.ok(doc.pageSettings);
  assert.equal(doc.pageSettings.paperSize, "A4");
  assert.equal(doc.pageSettings.orientation, "portrait");
  assert.deepEqual(doc.pageSettings.margins, MARGIN_PRESETS.Normal);
  assert.equal(isValidDocumentModel(doc), true);
});

test("Backward Compatibility: Phase 1 legacy .mwd files without pageSettings deserialize cleanly", () => {
  // Cấu trúc file Phase 1 cũ (hoàn toàn không có trường pageSettings)
  const legacyPhase1Package = {
    format: "PersonalWordDocument",
    version: 1,
    metadata: {
      id: "legacy-doc-001",
      title: "Tai lieu Phase 1 cu",
      version: 1,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    },
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung tài liệu từ Phase 1." }],
        },
      ],
    },
  };

  const jsonString = JSON.stringify(legacyPhase1Package);
  const result = deserializeMwdToDocument(jsonString);

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.document.metadata.title, "Tai lieu Phase 1 cu");
  // Tự động nhận default PageSettings mà không crash
  assert.ok(result.document.pageSettings);
  assert.equal(result.document.pageSettings.paperSize, "A4");
  assert.equal(result.document.pageSettings.orientation, "portrait");
  assert.deepEqual(result.document.pageSettings.margins, MARGIN_PRESETS.Normal);
  assert.equal(result.document.pageSettings.marginPreset, "Normal");
});

test("File Round-trip: serializing and deserializing preserves custom PageSettings", () => {
  const initialDoc = createInitialDocument("Báo Cáo Pháp Lý");
  const customSettings: PageSettings = {
    paperSize: "Legal",
    orientation: "landscape",
    margins: { ...MARGIN_PRESETS.Narrow },
    marginPreset: "Narrow",
  };

  const updatedDoc = updateDocumentPageSettings(initialDoc, customSettings);
  assert.equal(updatedDoc.pageSettings.paperSize, "Legal");
  assert.equal(updatedDoc.pageSettings.orientation, "landscape");

  const mwdString = serializeDocumentToMwd(updatedDoc);
  const reloaded = deserializeMwdToDocument(mwdString);

  assert.equal(reloaded.success, true);
  if (!reloaded.success) return;

  assert.equal(reloaded.document.pageSettings.paperSize, "Legal");
  assert.equal(reloaded.document.pageSettings.orientation, "landscape");
  assert.deepEqual(reloaded.document.pageSettings.margins, MARGIN_PRESETS.Narrow);
  assert.equal(reloaded.document.pageSettings.marginPreset, "Narrow");
});

test("Zustand Document Store: updating pageSettings triggers isDirty", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  assert.equal(useDocumentStore.getState().isDirty, false);
  assert.equal(useDocumentStore.getState().pageSettings.paperSize, "A4");

  // Thay đổi khổ giấy sang Letter -> phải kích hoạt isDirty = true
  store.updatePageSettings({ paperSize: "Letter" });

  assert.equal(useDocumentStore.getState().isDirty, true);
  assert.equal(useDocumentStore.getState().pageSettings.paperSize, "Letter");
  assert.equal(useDocumentStore.getState().document.pageSettings.paperSize, "Letter");

  // Lưu file -> isDirty trở về false
  store.markSaved("C:/TestPath/Doc.mwd");
  assert.equal(useDocumentStore.getState().isDirty, false);

  // Thay đổi hướng trang sang landscape -> isDirty = true
  store.updatePageSettings({ orientation: "landscape" });
  assert.equal(useDocumentStore.getState().isDirty, true);
});
