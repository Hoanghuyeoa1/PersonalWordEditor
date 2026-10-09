import {
  getLocalName,
  getFirstChildByLocalName,
  getAttrValue,
} from "../../docx/utils/xmlUtils.ts";
import { parseFieldInstruction } from "../services/fieldEngine.ts";
import type { FieldAttributes } from "../types/fieldTypes.ts";

export interface ComplexFieldStackFrame {
  instruction: string;
  result: string;
  state: "IN_INSTRUCTION" | "IN_RESULT";
  rPrEl: Element | null;
}

/**
 * Trình phân tích trạng thái các trường phức hợp (w:fldChar) và trường đơn (w:fldSimple)
 * theo chuẩn ISO/IEC 29500 WordprocessingML.
 */
export class ComplexFieldParser {
  private stack: ComplexFieldStackFrame[] = [];

  /**
   * Kiểm tra xem hiện có trường nào đang mở dở dang trong stack không
   */
  public get isInField(): boolean {
    return this.stack.length > 0;
  }

  /**
   * Lấy khung trường hiện tại ở đỉnh stack
   */
  public get currentFrame(): ComplexFieldStackFrame | undefined {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
  }

  /**
   * Xử lý phần tử <w:fldChar>
   * @returns FieldAttributes nếu vừa đóng một trường hoàn chỉnh ở cấp cao nhất (root level), null nếu chưa
   */
  public handleFldChar(fldCharEl: Element, rPrEl: Element | null): FieldAttributes | null {
    const fldCharType = (
      getAttrValue(fldCharEl, "fldchartype") ||
      fldCharEl.getAttribute("w:fldCharType") ||
      ""
    ).toLowerCase();

    if (fldCharType === "begin") {
      this.stack.push({
        instruction: "",
        result: "",
        state: "IN_INSTRUCTION",
        rPrEl,
      });
      return null;
    }

    if (fldCharType === "separate") {
      if (this.stack.length > 0) {
        this.stack[this.stack.length - 1].state = "IN_RESULT";
      }
      return null;
    }

    if (fldCharType === "end") {
      if (this.stack.length > 0) {
        const frame = this.stack.pop()!;
        const fieldAttrs = parseFieldInstruction(frame.instruction, frame.result);
        fieldAttrs.isComplex = true;

        if (this.stack.length > 0) {
          // Nếu nằm trong một trường lồng nhau (Nested field), gộp kết quả vào frame cha
          this.stack[this.stack.length - 1].result += fieldAttrs.result || "";
          return null;
        }

        return fieldAttrs;
      }
    }

    return null;
  }

  /**
   * Tiếp nhận văn bản chỉ thị từ <w:instrText>
   */
  public appendInstructionText(text: string): void {
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].instruction += text;
    }
  }

  /**
   * Tiếp nhận văn bản kết quả hiển thị từ <w:t>
   * @returns true nếu văn bản đã được ghi nhận vào field hiện tại, false nếu không nằm trong field
   */
  public appendResultText(text: string): boolean {
    if (this.stack.length > 0) {
      const top = this.stack[this.stack.length - 1];
      if (top.state === "IN_RESULT") {
        top.result += text;
      } else {
        top.instruction += text;
      }
      return true;
    }
    return false;
  }

  /**
   * Xử lý trường đơn <w:fldSimple>
   */
  public parseFldSimple(fldSimpleEl: Element): { fieldAttrs: FieldAttributes; childRuns: Element[] } {
    const instr =
      fldSimpleEl.getAttribute("w:instr") ||
      fldSimpleEl.getAttribute("instr") ||
      "";

    let resultText = "";
    const childRuns: Element[] = [];

    for (let i = 0; i < fldSimpleEl.childNodes.length; i++) {
      const node = fldSimpleEl.childNodes[i];
      if (node.nodeType !== 1) continue;
      if (getLocalName(node).toLowerCase() === "r") {
        const rEl = node as Element;
        childRuns.push(rEl);
        const tEl = getFirstChildByLocalName(rEl, "t");
        if (tEl && tEl.textContent) {
          resultText += tEl.textContent;
        }
      }
    }

    const fieldAttrs = parseFieldInstruction(instr, resultText);
    fieldAttrs.isComplex = false;

    return { fieldAttrs, childRuns };
  }

  /**
   * Kết thúc duyệt đoạn văn: giải phóng an toàn các trường chưa kịp đóng thẻ `end` (Fail-safe Recovery)
   */
  public flushRemainingFrames(): FieldAttributes[] {
    const recovered: FieldAttributes[] = [];
    while (this.stack.length > 0) {
      const frame = this.stack.pop()!;
      if (frame.instruction.trim() || frame.result.trim()) {
        const field = parseFieldInstruction(frame.instruction, frame.result);
        field.isComplex = true;
        recovered.push(field);
      }
    }
    return recovered;
  }
}
