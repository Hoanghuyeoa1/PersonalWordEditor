import type { ProofingState } from "../types/reviewTypes.ts";
import type { ProofingIssue } from "./proofingTypes.ts";
import { spellCheckPluginKey } from "./spellCheckExtension.ts";

/**
 * Proofing Service - Personal Word Editor (Phase 5.7 Architecture)
 *
 * Quản lý trạng thái và cấu hình cho hệ thống kiểm tra chính tả (Spelling)
 * và ngữ pháp (Grammar). Tách biệt hoàn toàn khỏi Comments và Track Changes.
 * Cung cấp tiện ích điều hướng Next/Previous Issue (F7 / Shift+F7).
 */
export class ProofingService {
  private static defaultState: ProofingState = {
    proofingEnabled: false,
    spellCheckLanguage: "vi-VN",
    highlightSpellingErrors: true,
    highlightGrammarErrors: true,
  };

  /**
   * Kiểm tra xem engine kiểm lỗi hiện tại có sẵn sàng hoạt động hay không
   */
  public static isProofingAvailable(): boolean {
    // Phase 5.2: Spell Check Core đã hoạt động
    return true;
  }

  /**
   * Lấy cấu hình mặc định của proofing
   */
  public static getDefaultState(): ProofingState {
    return { ...this.defaultState };
  }

  /**
   * Danh sách ngôn ngữ kiểm tra chính tả được hỗ trợ (dự kiến)
   */
  public static getSupportedLanguages(): Array<{ code: string; label: string }> {
    return [
      { code: "vi-VN", label: "Tiếng Việt" },
      { code: "en-US", label: "English (United States)" },
    ];
  }

  /**
   * Lấy danh sách toàn bộ issues (chính tả & ngữ pháp) đang hiển thị trong editor
   */
  public static getIssuesFromEditor(editor: any): ProofingIssue[] {
    if (!editor || !editor.state) return [];
    try {
      const pluginState = spellCheckPluginKey.getState(editor.state);
      if (pluginState?.issues && Array.isArray(pluginState.issues)) {
        return [...pluginState.issues].sort((a, b) => a.from - b.from);
      }
    } catch {
      // ignore
    }
    return [];
  }

  /**
   * Tìm kiếm lỗi kiểm tra tiếp theo (Next Issue)
   */
  public static findNextIssue(editor: any): ProofingIssue | null {
    const issues = this.getIssuesFromEditor(editor);
    if (issues.length === 0) return null;
    const currentPos = editor.state.selection?.to ?? 0;
    const next = issues.find((iss) => iss.from > currentPos);
    return next || issues[0];
  }

  /**
   * Tìm kiếm lỗi kiểm tra trước đó (Previous Issue)
   */
  public static findPreviousIssue(editor: any): ProofingIssue | null {
    const issues = this.getIssuesFromEditor(editor);
    if (issues.length === 0) return null;
    const currentPos = editor.state.selection?.from ?? 0;
    const reversed = [...issues].reverse();
    const prev = reversed.find((iss) => iss.to < currentPos);
    return prev || issues[issues.length - 1];
  }

  /**
   * Di chuyển con trỏ và vùng chọn tới lỗi kiểm tra cụ thể
   */
  public static navigateToIssue(editor: any, issue: ProofingIssue): boolean {
    if (!editor || !issue) return false;
    try {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: issue.from, to: issue.to })
        .scrollIntoView()
        .run();
      return true;
    } catch {
      return false;
    }
  }
}

