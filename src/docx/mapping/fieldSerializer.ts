import type { FieldAttributes } from "../../fields/types/fieldTypes.ts";
import { formatFieldInstruction } from "../../fields/services/fieldEngine.ts";
import { escapeXmlAttr, buildTextElement } from "../serializer/xmlBuilder.ts";

/**
 * Tuần tự hóa một đối tượng FieldAttributes thành chuỗi XML (w:fldSimple hoặc w:fldChar)
 * Tuân thủ ISO/IEC 29500 WordprocessingML.
 * Được dùng chung giữa document body serializer và header/footer serializer (Phase 12).
 */
export function serializeFieldXml(
  fieldAttrs: FieldAttributes,
  rPrXml: string = "",
  options?: { isComplex?: boolean }
): string {
  const instr = formatFieldInstruction(fieldAttrs);
  const result = fieldAttrs.result !== undefined && fieldAttrs.result !== null ? String(fieldAttrs.result) : "1";
  const isComplex = options?.isComplex ?? Boolean(fieldAttrs.isComplex);

  if (isComplex) {
    return (
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
      `<w:r><w:instrText xml:space="preserve"> ${escapeXmlAttr(instr)} </w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r>${rPrXml}${buildTextElement(result)}</w:r>` +
      `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
    );
  } else {
    return `<w:fldSimple w:instr="${escapeXmlAttr(instr)}"><w:r>${rPrXml}${buildTextElement(result)}</w:r></w:fldSimple>`;
  }
}
