import type { PageSettings } from "../../page/types/pageTypes.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/index.ts";
import { mmToTwips } from "../utils/xmlUtils.ts";

/**
 * Kích thước chuẩn (portrait) tính theo twips cho từng loại khổ giấy
 */
const PAPER_SIZE_TWIPS: Record<string, { w: number; h: number }> = {
  A4: { w: 11906, h: 16838 },
  Letter: { w: 12240, h: 15840 },
  Legal: { w: 12240, h: 20160 },
  A3: { w: 16838, h: 23811 },
};

export interface SectPrOptions {
  headerRelId?: string;
  footerRelId?: string;
}

/**
 * Chuyển đổi PageSettings thành chuỗi XML `<w:sectPr>` hoàn chỉnh
 */
export function buildSectPrXml(settings?: PageSettings, options?: SectPrOptions): string {
  const safeSettings = settings && settings.margins ? settings : DEFAULT_PAGE_SETTINGS;
  const paper = PAPER_SIZE_TWIPS[safeSettings.paperSize] || PAPER_SIZE_TWIPS.A4;
  const isLandscape = safeSettings.orientation === "landscape";

  const width = isLandscape ? paper.h : paper.w;
  const height = isLandscape ? paper.w : paper.h;

  const orientAttr = isLandscape ? ' w:orient="landscape"' : "";

  const topTwips = mmToTwips(safeSettings.margins.top);
  const bottomTwips = mmToTwips(safeSettings.margins.bottom);
  const leftTwips = mmToTwips(safeSettings.margins.left);
  const rightTwips = mmToTwips(safeSettings.margins.right);

  let headerRefXml = "";
  if (options?.headerRelId) {
    headerRefXml = `<w:headerReference w:type="default" r:id="${options.headerRelId}"/>\n    `;
  }

  let footerRefXml = "";
  if (options?.footerRelId) {
    footerRefXml = `<w:footerReference w:type="default" r:id="${options.footerRelId}"/>\n    `;
  }

  return `<w:sectPr>
    ${headerRefXml}${footerRefXml}<w:pgSz w:w="${width}" w:h="${height}"${orientAttr}/>
    <w:pgMar w:top="${topTwips}" w:right="${rightTwips}" w:bottom="${bottomTwips}" w:left="${leftTwips}" w:header="720" w:footer="720" w:gutter="0"/>
    <w:cols w:space="720"/>
    <w:docGrid w:linePitch="360"/>
  </w:sectPr>`;
}
