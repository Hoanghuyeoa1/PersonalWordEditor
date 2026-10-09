import type { Node as ProseMirrorNode } from "prosemirror-model";
import type {
  GrammarIssue,
  GrammarRule,
  GrammarCheckOptions,
  GrammarCheckContext,
  IGrammarProvider,
  SupportedLanguage,
} from "../proofingTypes.ts";
import { LocalGrammarProvider } from "./localGrammarProvider.ts";

const STORAGE_KEY_DISABLED_RULES = "personal_word_editor_disabled_grammar_rules";

/**
 * GrammarCheckerEngine - Bộ máy điều phối kiểm tra ngữ pháp (Phase 5.3)
 *
 * Thiết kế theo kiến trúc Pluggable:
 * - Hỗ trợ đăng ký nhiều Provider (Local Rules, LanguageTool, AI...).
 * - Mặc định sử dụng LocalGrammarProvider an toàn, offline.
 * - Quản lý cấu hình vô hiệu hóa rule (Disable Rule) lưu trong localStorage.
 * - Quản lý cơ chế bỏ qua (Ignore Once) theo phiên.
 */
export class GrammarCheckerEngine {
  private static providers: Map<string, IGrammarProvider> = new Map([
    ["local-rule-provider", new LocalGrammarProvider()],
  ]);

  private static activeProviderId = "local-rule-provider";
  private static disabledRuleIds: Set<string> = new Set();
  private static ignoredOnceIds: Set<string> = new Set();
  private static isInitialized = false;

  private static initStorage(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = window.localStorage.getItem(STORAGE_KEY_DISABLED_RULES);
        if (saved) {
          const list = JSON.parse(saved);
          if (Array.isArray(list)) {
            this.disabledRuleIds = new Set(list);
          }
        }
      }
    } catch {
      // Bỏ qua lỗi truy cập storage
    }
  }

  private static saveStorage(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          STORAGE_KEY_DISABLED_RULES,
          JSON.stringify(Array.from(this.disabledRuleIds))
        );
      }
    } catch {
      // Bỏ qua lỗi ghi storage
    }
  }

  public static registerProvider(provider: IGrammarProvider): void {
    this.providers.set(provider.id, provider);
  }

  public static setActiveProvider(id: string): void {
    if (this.providers.has(id)) {
      this.activeProviderId = id;
    }
  }

  public static getActiveProvider(): IGrammarProvider {
    return (
      this.providers.get(this.activeProviderId) ??
      this.providers.get("local-rule-provider")!
    );
  }

  public static getAllRules(): GrammarRule[] {
    this.initStorage();
    const provider = this.getActiveProvider();
    return provider.getRules().map((r) => ({
      ...r,
      enabled: !this.disabledRuleIds.has(r.id),
    }));
  }

  public static disableRule(ruleId: string): void {
    this.initStorage();
    this.disabledRuleIds.add(ruleId);
    this.saveStorage();
  }

  public static enableRule(ruleId: string): void {
    this.initStorage();
    this.disabledRuleIds.delete(ruleId);
    this.saveStorage();
  }

  public static isRuleDisabled(ruleId: string): boolean {
    this.initStorage();
    return this.disabledRuleIds.has(ruleId);
  }

  public static getDisabledRules(): string[] {
    this.initStorage();
    return Array.from(this.disabledRuleIds);
  }

  public static ignoreOnce(issueId: string): void {
    this.ignoredOnceIds.add(issueId);
  }

  public static resetIgnored(): void {
    this.ignoredOnceIds.clear();
  }

  public static clearDisabledRules(): void {
    this.disabledRuleIds.clear();
    this.saveStorage();
  }

  /**
   * Quét toàn bộ ProseMirror doc node và trả về danh sách GrammarIssue
   * Tuyệt đối không làm biến đổi Document AST hay tạo mark trong Document JSON.
   */
  public static checkDocument(
    doc: ProseMirrorNode,
    options?: GrammarCheckOptions
  ): GrammarIssue[] {
    this.initStorage();
    const provider = this.getActiveProvider();
    const lang: SupportedLanguage = options?.language ?? "en-US";

    const context: GrammarCheckContext = {
      language: lang,
      disabledRuleIds: options?.disabledRuleIds
        ? new Set(options.disabledRuleIds)
        : this.disabledRuleIds,
    };

    const issues: GrammarIssue[] = [];

    doc.descendants((node, pos) => {
      // Bỏ qua các khối đặc thù không phải văn xuôi thông thường
      if (
        node.type.name === "equation" ||
        node.type.name === "codeBlock" ||
        node.type.name === "pageBreak" ||
        node.type.name === "sectionBreak"
      ) {
        return false;
      }

      // Chỉ kiểm tra các khối chứa văn bản (paragraph, heading, tableCell...)
      if (!node.isTextblock) {
        return true;
      }

      const text = node.textContent;
      if (!text || !text.trim()) {
        return false;
      }

      const blockIssues = provider.checkTextblock(text, pos, context);

      for (const issue of blockIssues) {
        // Bỏ qua nếu issue này đã bị Ignore Once
        if (this.ignoredOnceIds.has(issue.id)) {
          continue;
        }
        issues.push(issue);
      }

      return false; // Không cần duyệt sâu vào các inline text nodes
    });

    return issues;
  }
}
