import type {
  GrammarIssue,
  GrammarRule,
  GrammarCheckContext,
  IGrammarProvider,
} from "../proofingTypes.ts";
import {
  LOCAL_GRAMMAR_RULES,
  getProtectedRanges,
  checkDoubleSpaces,
  checkSpaceBeforePunctuation,
  checkMissingSpaceAfterPunctuation,
  checkRepeatedWord,
  checkCapitalization,
  checkDoublePeriod,
} from "./grammarRules.ts";

/**
 * LocalGrammarProvider - Triển khai bộ quy tắc ngữ pháp cục bộ offline (Phase 5.3)
 *
 * Chạy hoàn toàn trên máy khách, không phụ thuộc AI hay kết nối Internet.
 * Áp dụng các quy tắc kiểm tra có độ chính xác cao (Precision > Rule Count).
 */
export class LocalGrammarProvider implements IGrammarProvider {
  public readonly id = "local-rule-provider";
  public readonly name = "Bộ quy tắc ngữ pháp cục bộ";

  public getRules(): GrammarRule[] {
    return [...LOCAL_GRAMMAR_RULES];
  }

  public checkTextblock(
    text: string,
    blockPos: number,
    context: GrammarCheckContext
  ): GrammarIssue[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const disabledRules = context.disabledRuleIds;
    const protectedRanges = getProtectedRanges(text);
    const allIssues: GrammarIssue[] = [];

    // 1. Khoảng trắng thừa (double-spaces)
    if (!disabledRules.has("double-spaces")) {
      allIssues.push(...checkDoubleSpaces(text, blockPos, protectedRanges));
    }

    // 2. Khoảng trắng trước dấu câu (space-before-punctuation)
    if (!disabledRules.has("space-before-punctuation")) {
      allIssues.push(...checkSpaceBeforePunctuation(text, blockPos, protectedRanges));
    }

    // 3. Thiếu khoảng trắng sau dấu câu (missing-space-after-punctuation)
    if (!disabledRules.has("missing-space-after-punctuation")) {
      allIssues.push(...checkMissingSpaceAfterPunctuation(text, blockPos, protectedRanges));
    }

    // 4. Từ lặp lại (repeated-word)
    if (!disabledRules.has("repeated-word")) {
      allIssues.push(...checkRepeatedWord(text, blockPos, protectedRanges));
    }

    // 5. Viết hoa đầu câu (capitalization)
    if (!disabledRules.has("capitalization")) {
      allIssues.push(...checkCapitalization(text, blockPos, protectedRanges));
    }

    // 6. Dấu chấm đôi bất thường (double-period)
    if (!disabledRules.has("double-period")) {
      allIssues.push(...checkDoublePeriod(text, blockPos, protectedRanges));
    }

    // Sắp xếp các issue theo thứ tự vị trí xuất hiện trong tài liệu
    return allIssues.sort((a, b) => a.from - b.from);
  }
}
