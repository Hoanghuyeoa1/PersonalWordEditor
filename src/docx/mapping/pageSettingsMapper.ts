import {
  getFirstChildByLocalName,
  getAttrValue,
  twipsToMm,
} from "../utils/xmlUtils.ts";
import type {
  PageSettings,
  PaperSizeName,
  PageOrientation,
  PageMargins,
} from "../../page/types/pageTypes.ts";
import {
  DEFAULT_PAGE_SETTINGS,
  validateAndNormalizePageSettings,
  detectMarginPreset,
} from "../../page/index.ts";

/**
 * Nhận diện khổ giấy từ kích thước twips (width, height)
 */
export function detectPaperSizeFromTwips(
  wTwips: number,
  hTwips: number
): { paperSize: PaperSizeName; orientation: PageOrientation } {
  const isLandscape = wTwips > hTwips;
  const portraitW = isLandscape ? hTwips : wTwips;
  const portraitH = isLandscape ? wTwips : hTwips;

  const orientation: PageOrientation = isLandscape ? "landscape" : "portrait";

  // Dung sai so sánh twips (khoảng 100 twips ~ 1.7mm)
  const tol = 200;

  // A4: 11906 x 16838
  if (Math.abs(portraitW - 11906) < tol && Math.abs(portraitH - 16838) < tol) {
    return { paperSize: "A4", orientation };
  }

  // Letter: 12240 x 15840
  if (Math.abs(portraitW - 12240) < tol && Math.abs(portraitH - 15840) < tol) {
    return { paperSize: "Letter", orientation };
  }

  // Legal: 12240 x 20160
  if (Math.abs(portraitW - 12240) < tol && Math.abs(portraitH - 20160) < tol) {
    return { paperSize: "Legal", orientation };
  }

  // A3: 16838 x 23811
  if (Math.abs(portraitW - 16838) < tol && Math.abs(portraitH - 23811) < tol) {
    return { paperSize: "A3", orientation };
  }

  // Tiệm cận gần nhất: nếu chiều dài > 19000 -> Legal hoặc A3
  if (portraitH >= 19000) {
    if (portraitW >= 15000) return { paperSize: "A3", orientation };
    return { paperSize: "Legal", orientation };
  }

  // Mặc định A4
  return { paperSize: "A4", orientation };
}

/**
 * Phân tích phần <w:sectPr> thành PageSettings
 */
export function parseSectionPageSettings(sectPrEl: Element | null): PageSettings {
  if (!sectPrEl) {
    return { ...DEFAULT_PAGE_SETTINGS };
  }

  let paperSize: PaperSizeName = DEFAULT_PAGE_SETTINGS.paperSize;
  let orientation: PageOrientation = DEFAULT_PAGE_SETTINGS.orientation;
  let margins: PageMargins = { ...DEFAULT_PAGE_SETTINGS.margins };

  // 1. Phân tích <w:pgSz>
  const pgSzEl = getFirstChildByLocalName(sectPrEl, "pgsz");
  if (pgSzEl) {
    const wStr = getAttrValue(pgSzEl, "w");
    const hStr = getAttrValue(pgSzEl, "h");
    const orientStr = (getAttrValue(pgSzEl, "orient") || "").toLowerCase();

    const wTwips = wStr ? parseInt(wStr, 10) : 11906;
    const hTwips = hStr ? parseInt(hStr, 10) : 16838;

    const detected = detectPaperSizeFromTwips(wTwips, hTwips);
    paperSize = detected.paperSize;
    orientation = orientStr === "landscape" ? "landscape" : detected.orientation;
  }

  // 2. Phân tích <w:pgMar>
  const pgMarEl = getFirstChildByLocalName(sectPrEl, "pgmar");
  if (pgMarEl) {
    const topStr = getAttrValue(pgMarEl, "top");
    const rightStr = getAttrValue(pgMarEl, "right");
    const bottomStr = getAttrValue(pgMarEl, "bottom");
    const leftStr = getAttrValue(pgMarEl, "left");

    const topTwips = topStr ? parseInt(topStr, 10) : 1440;
    const rightTwips = rightStr ? parseInt(rightStr, 10) : 1440;
    const bottomTwips = bottomStr ? parseInt(bottomStr, 10) : 1440;
    const leftTwips = leftStr ? parseInt(leftStr, 10) : 1440;

    margins = {
      top: twipsToMm(topTwips),
      right: twipsToMm(rightTwips),
      bottom: twipsToMm(bottomTwips),
      left: twipsToMm(leftTwips),
    };
  }

  const preset = detectMarginPreset(margins);

  return validateAndNormalizePageSettings({
    paperSize,
    orientation,
    margins,
    marginPreset: preset,
  });
}
