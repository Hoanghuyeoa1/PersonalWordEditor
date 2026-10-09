import test from "node:test";
import assert from "node:assert/strict";
import {
  PAPER_DIMENSIONS,
  MARGIN_PRESETS,
  DEFAULT_PAGE_SETTINGS,
} from "./services/pageConstants.ts";
import {
  getPageDimensions,
  getPageCssVariables,
  detectMarginPreset,
  mmToCm,
  cmToMm,
  validateCustomMargins,
  validateAndNormalizePageSettings,
} from "./services/pageSettingsService.ts";
import type { PageMargins } from "./types/pageTypes.ts";
import {
  createInitialDocument,
  updateDocumentPageSettings,
} from "../document/documentModel.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import { useZoomStore } from "../stores/zoomStore.ts";

test("Phase 2.4 Conversion Helpers: mmToCm and cmToMm convert accurately with 2 decimal precision", () => {
  // 1 cm = 10 mm
  assert.strictEqual(mmToCm(25.4), 2.54);
  assert.strictEqual(cmToMm(2.54), 25.4);

  assert.strictEqual(mmToCm(12.7), 1.27);
  assert.strictEqual(cmToMm(1.27), 12.7);

  assert.strictEqual(mmToCm(50.8), 5.08);
  assert.strictEqual(cmToMm(5.08), 50.8);

  assert.strictEqual(mmToCm(30), 3);
  assert.strictEqual(cmToMm(3), 30);

  assert.strictEqual(mmToCm(0), 0);
  assert.strictEqual(cmToMm(0), 0);
});

test("Phase 2.4 Validation: Rejects NaN, Infinity, negative values and excessive margins", () => {
  const a4Dimensions = getPageDimensions("A4", "portrait"); // 210 x 297 mm

  // 1. NaN
  const nanMargins: PageMargins = { top: NaN, bottom: 20, left: 20, right: 20 };
  const nanResult = validateCustomMargins(nanMargins, a4Dimensions);
  assert.strictEqual(nanResult.isValid, false);
  assert.ok(nanResult.error?.includes("NaN") || nanResult.error?.includes("không hợp lệ"));

  // 2. Infinity
  const infMargins: PageMargins = { top: 20, bottom: Infinity, left: 20, right: 20 };
  const infResult = validateCustomMargins(infMargins, a4Dimensions);
  assert.strictEqual(infResult.isValid, false);

  // 3. Số âm
  const negMargins: PageMargins = { top: -5, bottom: 20, left: 20, right: 20 };
  const negResult = validateCustomMargins(negMargins, a4Dimensions);
  assert.strictEqual(negResult.isValid, false);
  assert.ok(negResult.error?.includes("số âm"));

  // 4. Lề ngang quá lớn (left 100mm + right 100mm = 200mm trên khổ rộng 210mm -> còn 10mm < 25.4mm)
  const excessiveWidthMargins: PageMargins = { top: 20, bottom: 20, left: 100, right: 100 };
  const excessiveWidthResult = validateCustomMargins(excessiveWidthMargins, a4Dimensions);
  assert.strictEqual(excessiveWidthResult.isValid, false);
  assert.ok(excessiveWidthResult.error?.includes("lề trái và phải"));

  // 5. Lề dọc quá lớn (top 140mm + bottom 140mm = 280mm trên khổ cao 297mm -> còn 17mm < 25.4mm)
  const excessiveHeightMargins: PageMargins = { top: 140, bottom: 140, left: 20, right: 20 };
  const excessiveHeightResult = validateCustomMargins(excessiveHeightMargins, a4Dimensions);
  assert.strictEqual(excessiveHeightResult.isValid, false);
  assert.ok(excessiveHeightResult.error?.includes("lề trên và dưới"));

  // 6. Lề hợp lệ
  const validMargins: PageMargins = { top: 20, bottom: 20, left: 30, right: 30 };
  const validResult = validateCustomMargins(validMargins, a4Dimensions);
  assert.strictEqual(validResult.isValid, true);
  assert.strictEqual(validResult.usableWidth, 210 - 60); // 150 mm
  assert.strictEqual(validResult.usableHeight, 297 - 40); // 257 mm
});

test("Phase 2.4 Preset Detection: Automatically detects Custom preset when margins differ from standards", () => {
  // Preset chuẩn
  assert.strictEqual(detectMarginPreset(MARGIN_PRESETS.Normal), "Normal");
  assert.strictEqual(detectMarginPreset(MARGIN_PRESETS.Narrow), "Narrow");
  assert.strictEqual(detectMarginPreset(MARGIN_PRESETS.Wide), "Wide");

  // Custom margin
  const customMargins: PageMargins = { top: 20, bottom: 20, left: 30, right: 30 };
  assert.strictEqual(detectMarginPreset(customMargins), "Custom");

  // Custom margin bất đối xứng
  const asymmetricMargins: PageMargins = { top: 35, bottom: 25, left: 20, right: 15 };
  assert.strictEqual(detectMarginPreset(asymmetricMargins), "Custom");
});

test("Phase 2.4 State & Dirty: Applying custom margins updates documentStore and triggers isDirty", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  assert.strictEqual(useDocumentStore.getState().isDirty, false);
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Normal");

  // Áp dụng Custom Margins: 30mm (3cm) cả 4 phía
  const custom: PageMargins = { top: 30, bottom: 30, left: 30, right: 30 };
  useDocumentStore.getState().updatePageSettings({ margins: custom });

  assert.strictEqual(useDocumentStore.getState().isDirty, true);
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Custom");
  assert.deepStrictEqual(useDocumentStore.getState().pageSettings.margins, custom);
  assert.deepStrictEqual(
    useDocumentStore.getState().document.pageSettings?.margins,
    custom
  );

  // Đổi lại Normal -> khôi phục snapshot ban đầu
  useDocumentStore.getState().updatePageSettings({ margins: MARGIN_PRESETS.Normal });
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Normal");
});

test("Phase 2.4 CSS Variables: Custom margins render accurately via getPageCssVariables", () => {
  const customSettings = {
    paperSize: "A4" as const,
    orientation: "portrait" as const,
    margins: { top: 30, bottom: 25, left: 35, right: 20 },
    marginPreset: "Custom" as const,
  };

  const vars = getPageCssVariables(customSettings);
  assert.strictEqual(vars["--page-margin-top"], "30mm");
  assert.strictEqual(vars["--page-margin-bottom"], "25mm");
  assert.strictEqual(vars["--page-margin-left"], "35mm");
  assert.strictEqual(vars["--page-margin-right"], "20mm");
});

test("Phase 2.4 Save/Open Round-Trip: Custom margins persist exactly through .mwd file", () => {
  const customMargins: PageMargins = { top: 30, bottom: 25, left: 35, right: 20 };
  const doc = updateDocumentPageSettings(createInitialDocument(), {
    paperSize: "Letter",
    orientation: "landscape",
    margins: customMargins,
    marginPreset: "Custom",
  });

  // Serialize to .mwd
  const mwdString = serializeDocumentToMwd(doc);
  const parsed = JSON.parse(mwdString);

  assert.strictEqual(parsed.pageSettings?.marginPreset, "Custom");
  assert.deepStrictEqual(parsed.pageSettings?.margins, customMargins);

  // Deserialize from .mwd
  const deserializeResult = deserializeMwdToDocument(mwdString);
  assert.strictEqual(deserializeResult.success, true);
  if (deserializeResult.success) {
    const restored = deserializeResult.document.pageSettings;
    assert.ok(restored);
    assert.strictEqual(restored.paperSize, "Letter");
    assert.strictEqual(restored.orientation, "landscape");
    assert.strictEqual(restored.marginPreset, "Custom");
    assert.deepStrictEqual(restored.margins, customMargins);

    // Kích thước lề được bảo toàn nguyên vẹn
    assert.strictEqual(restored.margins.top, 30);
    assert.strictEqual(restored.margins.bottom, 25);
    assert.strictEqual(restored.margins.left, 35);
    assert.strictEqual(restored.margins.right, 20);
  }
});

test("Phase 2.4 Zoom Independence: Zoom changes do not alter custom margins model", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const customMargins: PageMargins = { top: 32, bottom: 28, left: 24, right: 18 };
  store.updatePageSettings({ margins: customMargins });

  const zoomStore = useZoomStore.getState();
  zoomStore.resetZoom();
  assert.strictEqual(useZoomStore.getState().zoom, 100);

  // Thử các mức thu phóng
  zoomStore.setZoom(50);
  assert.strictEqual(useZoomStore.getState().zoom, 50);
  zoomStore.setZoom(150);
  assert.strictEqual(useZoomStore.getState().zoom, 150);
  zoomStore.setZoom(200);
  assert.strictEqual(useZoomStore.getState().zoom, 200);

  // Lề trong document model vẫn giữ nguyên chính xác
  assert.deepStrictEqual(useDocumentStore.getState().pageSettings.margins, customMargins);
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Custom");

  zoomStore.resetZoom();
});
