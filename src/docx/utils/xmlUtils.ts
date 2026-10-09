import { DOMParser } from "@xmldom/xmldom";

/**
 * Phân tích chuỗi XML thành DOM Document an toàn
 */
export function parseXmlString(xmlString: string): any {
  if (!xmlString || typeof xmlString !== "string" || !xmlString.trim()) {
    throw new Error("Dữ liệu XML rỗng hoặc không hợp lệ.");
  }

  let errorDetails = "";
  const parser = new DOMParser({
    onError: (lvl, msg) => {
      if (lvl === "fatalError" || lvl === "error") {
        errorDetails += msg;
      }
    },
  });

  try {
    const doc = parser.parseFromString(xmlString, "text/xml");
    const parserErrors = doc.getElementsByTagName("parsererror");
    if (parserErrors && parserErrors.length > 0) {
      const detail = parserErrors[0].textContent || errorDetails || "Cấu trúc XML không hợp lệ";
      throw new Error(`Lỗi cú pháp XML: ${detail}`);
    }
    return doc;
  } catch (err) {
    throw new Error(`Lỗi cú pháp XML: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Lấy localName (phần tên không chứa namespace prefix, ví dụ "w:p" -> "p")
 */
export function getLocalName(element: any): string {
  if (!element) return "";
  if (element.localName) {
    return element.localName;
  }
  const name = element.nodeName || "";
  const colonIdx = name.indexOf(":");
  return colonIdx >= 0 ? name.substring(colonIdx + 1) : name;
}

/**
 * Tìm tất cả các element con trực tiếp khớp với localName
 */
export function getDirectChildrenByLocalName(parent: any, localName: string): any[] {
  const result: any[] = [];
  if (!parent || !parent.childNodes) return result;

  const target = localName.toLowerCase();
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child && child.nodeType === 1 && getLocalName(child).toLowerCase() === target) {
      result.push(child);
    }
  }
  return result;
}

/**
 * Tìm element con trực tiếp đầu tiên khớp với localName
 */
export function getFirstChildByLocalName(parent: any, localName: string): any | null {
  if (!parent || !parent.childNodes) return null;

  const target = localName.toLowerCase();
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child && child.nodeType === 1 && getLocalName(child).toLowerCase() === target) {
      return child;
    }
  }
  return null;
}

/**
 * Tìm sâu (descendants) element đầu tiên khớp với localName
 */
export function findDescendantByLocalName(parent: any, localName: string): any | null {
  if (!parent || !parent.childNodes) return null;

  const target = localName.toLowerCase();
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child && child.nodeType === 1) {
      if (getLocalName(child).toLowerCase() === target) {
        return child;
      }
      const found = findDescendantByLocalName(child, localName);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Lấy giá trị thuộc tính an toàn (kiểm tra cả name có prefix và localName)
 */
export function getAttrValue(element: any, attrLocalName: string): string | null {
  if (!element || !element.attributes) return null;

  const target = attrLocalName.toLowerCase();
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    const name = attr.name || "";
    const local = (attr.localName || (name.includes(":") ? name.split(":")[1] : name)).toLowerCase();
    if (local === target || name.toLowerCase() === target) {
      return attr.value;
    }
  }
  return null;
}

/**
 * Lấy thuộc tính 'val' hoặc 'w:val' thông dụng trong OOXML
 */
export function getValAttribute(element: any | null): string | null {
  if (!element) return null;
  return getAttrValue(element, "val");
}

/**
 * Chuyển đổi OOXML twips (1/20 pt) sang milimet (mm)
 * 1 inch = 1440 twips = 25.4 mm
 * -> 1 mm = 1440 / 25.4 ≈ 56.692913 twips
 */
export function twipsToMm(twips: number): number {
  if (isNaN(twips) || twips <= 0) return 0;
  const mm = twips / (1440 / 25.4);
  return Math.round(mm * 10) / 10; // Làm tròn 1 chữ số thập phân
}

/**
 * Chuyển đổi OOXML twips sang pt (points)
 * 1 pt = 20 twips
 */
export function twipsToPt(twips: number): number {
  if (isNaN(twips)) return 0;
  return twips / 20;
}

/**
 * Chuyển đổi OOXML half-points (w:sz) sang pt
 * 24 half-points = 12 pt
 */
export function halfPointsToPt(halfPoints: number): number {
  if (isNaN(halfPoints) || halfPoints <= 0) return 11;
  return Math.round((halfPoints / 2) * 10) / 10;
}

/**
 * Chuyển đổi EMU (English Metric Units) sang pixels (96 DPI)
 * 1 inch = 914400 EMUs = 96 px -> 1 px = 9525 EMUs
 */
export function emuToPixels(emu: number): number {
  if (isNaN(emu) || emu <= 0) return 0;
  return Math.round(emu / 9525);
}

/**
 * Chuẩn hóa mã màu hex từ OOXML
 */
export function normalizeHexColor(rawColor: string | null): string | undefined {
  if (!rawColor) return undefined;
  const clean = rawColor.trim().replace(/^#/, "");
  if (clean.toLowerCase() === "auto") return undefined;
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toUpperCase();
  }
  return undefined;
}

/**
 * Bảng màu Word highlight -> CSS hex colors
 */
const WORD_HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: "#ffff00",
  green: "#00ff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  blue: "#0000ff",
  red: "#ff0000",
  darkblue: "#000080",
  darkcyan: "#008080",
  darkgreen: "#008000",
  darkmagenta: "#800080",
  darkred: "#800000",
  darkyellow: "#808000",
  darkgray: "#808080",
  lightgray: "#c0c0c0",
  black: "#000000",
};

/**
 * Chuẩn hóa màu highlight
 */
export function normalizeHighlightColor(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const lower = raw.trim().toLowerCase();
  if (lower === "none" || lower === "auto") return undefined;
  if (WORD_HIGHLIGHT_COLORS[lower]) {
    return WORD_HIGHLIGHT_COLORS[lower];
  }
  return normalizeHexColor(raw);
}

/**
 * Chuyển đổi milimet (mm) sang OOXML twips
 * 1 mm ≈ 56.692913 twips
 */
export function mmToTwips(mm: number): number {
  if (isNaN(mm) || mm <= 0) return 0;
  return Math.round(mm * (1440 / 25.4));
}

/**
 * Chuyển đổi points (pt) sang OOXML twips
 * 1 pt = 20 twips
 */
export function ptToTwips(pt: number): number {
  if (isNaN(pt) || pt <= 0) return 0;
  return Math.round(pt * 20);
}

/**
 * Chuyển đổi points (pt) sang OOXML half-points (w:sz)
 * 1 pt = 2 half-points
 */
export function ptToHalfPoints(pt: number): number {
  if (isNaN(pt) || pt <= 0) return 22; // Mặc định 11pt = 22
  return Math.round(pt * 2);
}

/**
 * Chuyển đổi pixels sang EMUs (English Metric Units)
 * 1 px = 9525 EMUs
 */
export function pixelsToEmu(px: number): number {
  if (isNaN(px) || px <= 0) return 0;
  return Math.round(px * 9525);
}

/**
 * Chuyển đổi pixels sang twips (cho độ rộng cột bảng)
 * 96 px = 1 inch = 1440 twips -> 1 px = 15 twips
 */
export function pixelsToTwips(px: number): number {
  if (isNaN(px) || px <= 0) return 0;
  return Math.round(px * 15);
}

/**
 * Chuyển đổi CSS color string (#RRGGBB, #RGB) sang mã hex không có dấu # cho OOXML
 */
export function cssColorToHex(cssColor: string | null | undefined): string | null {
  if (!cssColor) return null;
  const clean = cssColor.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return clean.toUpperCase();
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toUpperCase();
  }
  return null;
}

/**
 * Ánh xạ màu highlight sang giá trị w:highlight enum hợp lệ của OOXML
 */
export function colorToWordHighlight(color: string | null | undefined): string {
  if (!color) return "yellow";
  const c = color.trim().toLowerCase();
  if (c === "yellow" || c === "#ffff00" || c === "#ff0" || c.includes("yellow")) return "yellow";
  if (c === "green" || c === "#00ff00" || c === "#0f0" || c.includes("green")) return "green";
  if (c === "cyan" || c === "#00ffff" || c === "#0ff" || c.includes("cyan")) return "cyan";
  if (c === "magenta" || c === "#ff00ff" || c === "#f0f" || c.includes("magenta")) return "magenta";
  if (c === "blue" || c === "#0000ff" || c === "#00f" || c.includes("blue")) return "blue";
  if (c === "red" || c === "#ff0000" || c === "#f00" || c.includes("red")) return "red";
  if (c.includes("gray") || c.includes("grey")) return "lightGray";
  return "yellow";
}

/**
 * Phân tích phần tử On/Off boolean trong OOXML (CT_OnOff).
 * Hỗ trợ các thẻ toggle như w:keepNext, w:keepLines, w:pageBreakBefore, w:widowControl.
 * - Trả về true nếu thẻ tồn tại và không có w:val hoặc w:val="1" | "true" | "on".
 * - Trả về false nếu w:val="0" | "false" | "off".
 * - Trả về undefined nếu phần tử không tồn tại.
 */
export function parseOoxmlBooleanElement(element: any | null): boolean | undefined {
  if (!element) return undefined;
  const val = getValAttribute(element);
  if (val === null) return true;
  const lower = val.trim().toLowerCase();
  if (lower === "0" || lower === "false" || lower === "off") return false;
  if (lower === "1" || lower === "true" || lower === "on") return true;
  return true; // Mặc định bật khi thẻ tồn tại với giá trị khác
}
