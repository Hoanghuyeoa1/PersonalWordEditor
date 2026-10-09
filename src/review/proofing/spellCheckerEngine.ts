import type { Node as ProseMirrorNode } from "prosemirror-model";
import type {
  SpellingIssue,
  IDictionaryProvider,
  SupportedLanguage,
  SpellCheckOptions,
} from "./proofingTypes.ts";
import { EnglishDictionaryProvider } from "./dictionary/englishDictionary.ts";
import { VietnameseDictionaryProvider } from "./dictionary/vietnameseDictionary.ts";
import { UserDictionaryService } from "./dictionary/userDictionaryService.ts";

/**
 * Regex nhận diện URL hoặc Email để bỏ qua
 */
const URL_OR_EMAIL_REGEX =
  /(?:https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;

/**
 * Regex nhận diện mã màu hex hoặc chuỗi định danh chứa số
 */
const HEX_OR_CODE_REGEX = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]*[0-9]+[a-zA-Z0-9]*$/;

export class SpellCheckerEngine {
  private static providers: Map<SupportedLanguage, IDictionaryProvider> = new Map<
    SupportedLanguage,
    IDictionaryProvider
  >([
    ["en-US", new EnglishDictionaryProvider()],
    ["vi-VN", new VietnameseDictionaryProvider()],
  ]);

  private static currentLanguage: SupportedLanguage = "en-US";
  private static ignoredAllWords: Set<string> = new Set();
  private static ignoredOnceIds: Set<string> = new Set();

  public static setLanguage(lang: SupportedLanguage): void {
    if (this.providers.has(lang)) {
      this.currentLanguage = lang;
    }
  }

  public static getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  public static getProvider(lang?: SupportedLanguage): IDictionaryProvider {
    const targetLang = lang ?? this.currentLanguage;
    return this.providers.get(targetLang) ?? this.providers.get("en-US")!;
  }

  public static ignoreOnce(issueId: string): void {
    this.ignoredOnceIds.add(issueId);
  }

  public static ignoreAll(word: string): void {
    if (word) {
      this.ignoredAllWords.add(word.trim().toLowerCase());
    }
  }

  public static isIgnoredAll(word: string): boolean {
    if (!word) return false;
    return this.ignoredAllWords.has(word.trim().toLowerCase());
  }

  public static addToDictionary(word: string): boolean {
    return UserDictionaryService.addWord(word);
  }

  public static resetIgnored(): void {
    this.ignoredAllWords.clear();
    this.ignoredOnceIds.clear();
  }

  /**
   * Kiểm tra toàn bộ văn bản trong ProseMirror Document Node.
   * Trả về danh sách SpellingIssue mà không làm biến đổi Document AST.
   */
  public static checkDocument(
    doc: ProseMirrorNode,
    options?: Partial<SpellCheckOptions>
  ): SpellingIssue[] {
    const lang = options?.language ?? this.currentLanguage;
    const provider = this.getProvider(lang);
    const issues: SpellingIssue[] = [];

    // Duyệt qua tất cả các textblock trong document
    doc.descendants((node, pos) => {
      // Chỉ kiểm tra các khối chứa text (paragraph, heading, tableCell...)
      if (!node.isTextblock) {
        return true;
      }

      const text = node.textContent;
      if (!text || !text.trim()) {
        return false;
      }

      // Kiểm tra xem cả khối có phải là URL / code không
      if (URL_OR_EMAIL_REGEX.test(text.trim()) && text.trim().split(/\s+/).length === 1) {
        return false;
      }

      // Thu thập trước tất cả phạm vi chứa URL hoặc Email trong đoạn văn
      const urlOrEmailRanges: Array<{ start: number; end: number }> = [];
      const globalUrlRegex =
        /(?:https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
      let urlMatch: RegExpExecArray | null;
      while ((urlMatch = globalUrlRegex.exec(text)) !== null) {
        urlOrEmailRanges.push({
          start: urlMatch.index,
          end: urlMatch.index + urlMatch[0].length,
        });
      }

      // Tokenize từ ngữ dựa trên Unicode regex
      // Bắt các từ chứa chữ cái Unicode và dấu nháy đơn nội từ (don't, it's,...)
      const wordRegex = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)?/gu;
      let match: RegExpExecArray | null;

      while ((match = wordRegex.exec(text)) !== null) {
        const rawWord = match[0];
        const matchIndex = match.index;
        const matchEnd = matchIndex + rawWord.length;

        // Bỏ qua nếu từ chỉ có 1 ký tự (trừ từ "a", "i", "y" hợp lệ)
        if (rawWord.length === 1 && !/^[aiyAIY]$/.test(rawWord)) {
          continue;
        }

        // Bỏ qua nếu nằm trong URL hoặc Email
        if (urlOrEmailRanges.some((r) => matchIndex >= r.start && matchEnd <= r.end)) {
          continue;
        }

        // Bỏ qua nếu từ gắn liền trực tiếp với chữ số (ví dụ: v2.0, 3D, H2O, ISO9001)
        const isAttachedToDigit =
          (matchIndex > 0 && /\d/.test(text[matchIndex - 1])) ||
          (matchEnd < text.length && /\d/.test(text[matchEnd]));
        if (isAttachedToDigit) {
          continue;
        }

        // Bỏ qua nếu là mã màu hex (ví dụ: #1d4ed8, #fff)
        if (matchIndex > 0 && text[matchIndex - 1] === "#") {
          continue;
        }

        // Bỏ qua nếu là số hoặc mã hex/code
        if (HEX_OR_CODE_REGEX.test(rawWord)) {
          continue;
        }

        // Bỏ qua nếu toàn chữ hoa viết tắt (ví dụ: DOCX, HTML, CSS, ISO, USA)
        if (rawWord.length > 1 && rawWord === rawWord.toUpperCase()) {
          continue;
        }

        // Bỏ qua nếu nằm trong danh sách bỏ qua tất cả
        if (this.isIgnoredAll(rawWord)) {
          continue;
        }

        // Bỏ qua nếu có trong từ điển cá nhân người dùng
        if (UserDictionaryService.hasWord(rawWord)) {
          continue;
        }

        // Kiểm tra với từ điển ngôn ngữ hiện tại
        const isValid = provider.isWordValid(rawWord);
        if (!isValid) {
          const from = pos + 1 + matchIndex;
          const to = pos + 1 + matchEnd;
          const issueId = `spell-${from}-${to}-${rawWord}`;

          // Nếu issue này đã bị Ignore Once
          if (this.ignoredOnceIds.has(issueId)) {
            continue;
          }

          const suggestions = provider.getSuggestions(rawWord, 3);

          issues.push({
            id: issueId,
            from,
            to,
            word: rawWord,
            message: `Từ "${rawWord}" có thể bị viết sai chính tả.`,
            suggestions,
            language: provider.language,
          });
        }
      }

      return false; // Không duyệt sâu hơn vào inline children
    });

    return issues;
  }
}
