/**
 * Proofing, Spell Check & Grammar Check Types - Personal Word Editor (Phase 5.3)
 */

export type ProofingIssueType = "spelling" | "grammar";

export type ProofingSeverity = "error" | "warning" | "info";

export type SupportedLanguage = "en-US" | "vi-VN";

/**
 * Mô hình chuẩn cho một lỗi chính tả (Spelling Issue)
 */
export interface SpellingIssue {
  id: string;
  type?: "spelling";
  from: number;
  to: number;
  word: string;
  matchedText?: string;
  message: string;
  suggestions: string[];
  severity?: ProofingSeverity;
  language: string;
}

/**
 * Mô hình chuẩn cho một lỗi ngữ pháp / dấu câu (Grammar Issue)
 */
export interface GrammarIssue {
  id: string;
  type: "grammar";
  from: number;
  to: number;
  ruleId: string;
  ruleName?: string;
  matchedText: string;
  word?: string;
  message: string;
  suggestions: string[];
  severity: ProofingSeverity;
  language?: string;
}

/**
 * Kiểu tổng quát cho mọi vấn đề kiểm lỗi (Proofing Issue: Chính tả hoặc Ngữ pháp)
 */
export type ProofingIssue = SpellingIssue | GrammarIssue;

/**
 * Giao diện nhà cung cấp từ điển kiểm tra chính tả
 */
export interface IDictionaryProvider {
  readonly language: string;
  readonly languageName: string;
  isWordValid(word: string): boolean;
  getSuggestions(word: string, maxSuggestions?: number): string[];
}

/**
 * Cấu hình quy tắc ngữ pháp
 */
export interface GrammarRule {
  id: string;
  name: string;
  description: string;
  severity: ProofingSeverity;
  enabled: boolean;
}

/**
 * Ngữ cảnh truyền vào khi quét ngữ pháp
 */
export interface GrammarCheckContext {
  language: SupportedLanguage;
  disabledRuleIds: Set<string>;
}

/**
 * Kiến trúc pluggable cho bộ máy kiểm tra ngữ pháp (Grammar Provider)
 * Chuẩn bị sẵn sàng cho Local Rules, LanguageTool hoặc AI trong tương lai
 */
export interface IGrammarProvider {
  readonly id: string;
  readonly name: string;
  checkTextblock(text: string, blockPos: number, context: GrammarCheckContext): GrammarIssue[];
  getRules(): GrammarRule[];
}

export interface SpellCheckOptions {
  language: SupportedLanguage;
  checkCapitalization?: boolean;
  ignoreAllCaps?: boolean;
  ignoreNumbers?: boolean;
  ignoreUrlsAndEmails?: boolean;
}

export interface GrammarCheckOptions {
  language?: SupportedLanguage;
  disabledRuleIds?: string[];
}

export interface ProofingOptions {
  spellingEnabled: boolean;
  grammarEnabled: boolean;
  language: SupportedLanguage;
}

export interface SpellingContextState {
  activeIssue: ProofingIssue | null;
  position: { top: number; left: number } | null;
  isOpen: boolean;
}
