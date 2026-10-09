import { OmmlParser } from "./ommlParser.ts";
import { convertLatexToOmml } from "./latexToOmml.ts";
import type { OmmlParseResult, OmmlExportOptions, OmmlExportResult } from "./ommlTypes.ts";

/**
 * OMML Equation Fidelity Engine (Phase 5)
 * Cung cấp API thống nhất cho việc nhập/xuất công thức toán học giữa OMML và LaTeX.
 */
export class OmmlEngine {
  private static parser = new OmmlParser();

  /**
   * Phân tích một phần tử XML OMML (<m:oMath> hoặc <m:oMathPara>) thành LaTeX
   */
  public static parseOmml(mathEl: Element): OmmlParseResult {
    return this.parser.parse(mathEl);
  }

  /**
   * Chuyển đổi mã nguồn LaTeX thành chuỗi XML OMML theo chuẩn ISO/IEC 29500
   */
  public static exportToOmml(latex: string, options?: OmmlExportOptions): OmmlExportResult {
    return convertLatexToOmml(latex, options);
  }

  /**
   * Kiểm tra xem một phần tử XML có phải là OMML hay không
   */
  public static isMathElement(el: Element): boolean {
    const local = el.localName?.toLowerCase() || "";
    return local === "omath" || local === "omathpara";
  }
}
