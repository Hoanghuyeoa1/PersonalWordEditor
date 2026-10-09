import type { DocumentStyle, DocumentStylesMetadata } from "../types/styleTypes.ts";
import { resolveAllStyles } from "./styleResolver.ts";

export const STYLES_STYLESHEET_ELEMENT_ID = "word-editor-dynamic-styles";

/**
 * Tạo chuỗi CSS quy tắc định kiểu từ danh sách Style đã được resolve.
 */
export function generateDocumentStylesCss(
  definitions: DocumentStyle[] | Map<string, DocumentStyle> | DocumentStylesMetadata
): string {
  const rawDefs =
    definitions && typeof definitions === "object" && "definitions" in definitions
      ? definitions.definitions
      : definitions;
  const resolvedMap = resolveAllStyles(rawDefs);
  const cssRules: string[] = [];

  for (const style of resolvedMap.values()) {
    const selector =
      style.type === "character"
        ? `.word-character-style-${style.id}`
        : `.word-style-${style.id}`;
    const declarations: string[] = [];

    // 1. Thuộc tính Paragraph (nếu là paragraph style)
    if (style.paragraph) {
      const p = style.paragraph;
      if (p.textAlign) {
        declarations.push(`text-align: ${p.textAlign};`);
      }
      if (p.lineSpacing) {
        declarations.push(`line-height: ${p.lineSpacing};`);
      }
      if (typeof p.spacingBefore === "number") {
        declarations.push(`margin-top: ${p.spacingBefore}pt;`);
      }
      if (typeof p.spacingAfter === "number") {
        declarations.push(`margin-bottom: ${p.spacingAfter}pt;`);
      }
      if (typeof p.leftIndent === "number" && p.leftIndent > 0) {
        declarations.push(`margin-left: ${p.leftIndent}pt;`);
      }
      if (typeof p.rightIndent === "number" && p.rightIndent > 0) {
        declarations.push(`margin-right: ${p.rightIndent}pt;`);
      }
      if (typeof p.firstLineIndent === "number" && p.firstLineIndent > 0) {
        declarations.push(`text-indent: ${p.firstLineIndent}pt;`);
      } else if (typeof p.hangingIndent === "number" && p.hangingIndent > 0) {
        declarations.push(`text-indent: -${p.hangingIndent}pt; padding-left: ${p.hangingIndent}pt;`);
      }
    }

    // 2. Thuộc tính Character
    if (style.character) {
      const c = style.character;
      if (c.fontFamily) {
        declarations.push(`font-family: ${c.fontFamily};`);
      }
      if (c.fontSize) {
        const sizeStr = typeof c.fontSize === "number" ? `${c.fontSize}pt` : c.fontSize;
        declarations.push(`font-size: ${sizeStr};`);
      }
      if (c.bold) {
        declarations.push("font-weight: bold;");
      } else if (c.bold === false) {
        declarations.push("font-weight: normal;");
      }
      if (c.italic) {
        declarations.push("font-style: italic;");
      } else if (c.italic === false) {
        declarations.push("font-style: normal;");
      }
      if (c.underline && c.strike) {
        declarations.push("text-decoration: underline line-through;");
      } else if (c.underline) {
        declarations.push("text-decoration: underline;");
      } else if (c.strike) {
        declarations.push("text-decoration: line-through;");
      }
      if (c.color) {
        declarations.push(`color: ${c.color};`);
      }
      if (c.highlight) {
        declarations.push(`background-color: ${c.highlight};`);
      }
    }

    if (declarations.length > 0) {
      cssRules.push(`${selector} {\n  ${declarations.join("\n  ")}\n}`);
    }
  }

  return cssRules.join("\n\n");
}

/**
 * Cập nhật hoặc tiêm một thẻ <style> chứa các quy tắc style động vào DOM.
 * Đảm bảo mọi block mang class `.word-style-<styleId>` lập tức render theo định nghĩa mới mà không cần chạm vào AST.
 */
export function updateDocumentStylesStylesheet(
  definitions: DocumentStyle[] | Map<string, DocumentStyle>,
  targetDoc?: Document
): void {
  const doc = targetDoc ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return;

  const css = generateDocumentStylesCss(definitions);
  let styleEl = doc.getElementById(STYLES_STYLESHEET_ELEMENT_ID) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = STYLES_STYLESHEET_ELEMENT_ID;
    doc.head?.appendChild(styleEl);
  }

  styleEl.textContent = css;
}
