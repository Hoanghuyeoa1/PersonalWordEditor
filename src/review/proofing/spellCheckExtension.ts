import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import type {
  SpellingIssue,
  GrammarIssue,
  ProofingIssue,
  SpellCheckOptions,
} from "./proofingTypes.ts";
import { SpellCheckerEngine } from "./spellCheckerEngine.ts";
import { GrammarCheckerEngine } from "./grammar/grammarCheckerEngine.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";

export const spellCheckPluginKey = new PluginKey<SpellCheckPluginState>("spellCheck");

export interface SpellCheckPluginState {
  issues: ProofingIssue[];
  decorations: DecorationSet;
  lastCheckedDoc: ProseMirrorNode | null;
}

export function buildSpellingDecorations(
  doc: ProseMirrorNode,
  issues: ProofingIssue[]
): DecorationSet {
  if (!issues.length) {
    return DecorationSet.empty;
  }

  const decos: Decoration[] = [];
  for (const issue of issues) {
    // Đảm bảo offset nằm gọn trong giới hạn doc
    if (issue.from < doc.content.size && issue.to <= doc.content.size && issue.from < issue.to) {
      const isGrammar = issue.type === "grammar";
      const className = isGrammar
        ? `grammar-error-decoration${issue.severity === "info" ? " info" : ""}`
        : "spelling-error-decoration";

      const wordOrMatched = issue.word ?? issue.matchedText ?? "";

      decos.push(
        Decoration.inline(
          issue.from,
          issue.to,
          {
            class: className,
            "data-issue-id": issue.id,
            "data-issue-type": issue.type ?? "spelling",
            "data-word": wordOrMatched,
            title: `${issue.message} (Nhấp hoặc chuột phải để xem gợi ý sửa)`,
          },
          {
            class: isGrammar ? "grammar-error-decoration" : "spelling-error-decoration",
            "data-word": wordOrMatched,
            "data-rule-id": isGrammar ? (issue as GrammarIssue).ruleId : undefined,
            type: issue.type ?? "spelling",
            issue,
          }
        )
      );
    }
  }

  return DecorationSet.create(doc, decos);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spellCheck: {
      /** Yêu cầu quét lại chính tả & ngữ pháp toàn tài liệu ngay lập tức */
      recheckSpelling: () => ReturnType;
      /** Alias cho recheckSpelling */
      recheckProofing: () => ReturnType;
      /** Thay thế từ sai chính tả bằng từ gợi ý (bảo toàn formatting) */
      replaceSpellingIssue: (issue: SpellingIssue, replacement: string) => ReturnType;
      /** Áp dụng gợi ý sửa lỗi kiểm duyệt (chính tả hoặc ngữ pháp) */
      applyProofingSuggestion: (issue: ProofingIssue, replacement: string) => ReturnType;
      /** Bỏ qua issue chính tả này một lần */
      ignoreSpellingOnce: (issueId: string) => ReturnType;
      /** Bỏ qua từ này trong toàn bộ phiên làm việc */
      ignoreSpellingAll: (word: string) => ReturnType;
      /** Thêm từ vào từ điển cá nhân người dùng */
      addWordToUserDictionary: (word: string) => ReturnType;
      /** Bỏ qua issue ngữ pháp này một lần */
      ignoreGrammarIssue: (issueId: string) => ReturnType;
      /** Vô hiệu hóa một quy tắc ngữ pháp */
      disableGrammarRule: (ruleId: string) => ReturnType;
    };
  }
}

export const SpellCheck = Extension.create<SpellCheckOptions>({
  name: "spellCheck",

  addOptions() {
    return {
      language: "en-US",
      checkCapitalization: true,
      ignoreAllCaps: true,
      ignoreNumbers: true,
      ignoreUrlsAndEmails: true,
    };
  },

  addCommands() {
    return {
      recheckSpelling:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },

      recheckProofing:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },

      replaceSpellingIssue:
        (issue: SpellingIssue, replacement: string) =>
        ({ tr, state, dispatch }) => {
          if (dispatch) {
            // Lấy marks hiện tại tại vị trí issue để bảo toàn in đậm, in nghiêng, màu sắc...
            const $from = state.doc.resolve(Math.min(issue.from, state.doc.content.size));
            const marks = $from.nodeAfter?.marks ?? $from.marks();
            const textNode = state.schema.text(replacement, marks);

            tr.replaceWith(issue.from, issue.to, textNode);
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },

      applyProofingSuggestion:
        (issue: ProofingIssue, replacement: string) =>
        ({ tr, state, dispatch }) => {
          if (dispatch) {
            const $from = state.doc.resolve(Math.min(issue.from, state.doc.content.size));
            const marks = $from.nodeAfter?.marks ?? $from.marks();
            const textNode = state.schema.text(replacement, marks);

            tr.replaceWith(issue.from, issue.to, textNode);
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },

      ignoreSpellingOnce:
        (issueId: string) =>
        ({ tr, dispatch }) => {
          SpellCheckerEngine.ignoreOnce(issueId);
          if (dispatch) {
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },

      ignoreSpellingAll:
        (word: string) =>
        ({ tr, dispatch }) => {
          SpellCheckerEngine.ignoreAll(word);
          if (dispatch) {
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },

      addWordToUserDictionary:
        (word: string) =>
        ({ tr, dispatch }) => {
          SpellCheckerEngine.addToDictionary(word);
          if (dispatch) {
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },

      ignoreGrammarIssue:
        (issueId: string) =>
        ({ tr, dispatch }) => {
          GrammarCheckerEngine.ignoreOnce(issueId);
          if (dispatch) {
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },

      disableGrammarRule:
        (ruleId: string) =>
        ({ tr, dispatch }) => {
          GrammarCheckerEngine.disableRule(ruleId);
          if (dispatch) {
            tr.setMeta(spellCheckPluginKey, { recheck: true });
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let editorView: EditorView | null = null;

    return [
      new Plugin<SpellCheckPluginState>({
        key: spellCheckPluginKey,

        view(view) {
          editorView = view;
          return {
            update() {},
            destroy() {
              if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
              }
              editorView = null;
            },
          };
        },

        state: {
          init(_, state) {
            const { proofingEnabled, grammarEnabled } = useReviewStore.getState();
            const spellingIssues = proofingEnabled ? SpellCheckerEngine.checkDocument(state.doc) : [];
            const grammarIssues = grammarEnabled ? GrammarCheckerEngine.checkDocument(state.doc) : [];
            const issues: ProofingIssue[] = [...spellingIssues, ...grammarIssues];

            return {
              issues,
              decorations: buildSpellingDecorations(state.doc, issues),
              lastCheckedDoc: state.doc,
            };
          },

          apply(tr, pluginState, _oldEditorState, newEditorState) {
            const { proofingEnabled, grammarEnabled } = useReviewStore.getState();

            if (!proofingEnabled && !grammarEnabled) {
              return {
                issues: [],
                decorations: DecorationSet.empty,
                lastCheckedDoc: newEditorState.doc,
              };
            }

            const meta = tr.getMeta(spellCheckPluginKey);

            // Nếu nhận tín hiệu recheck tức thời
            if (meta?.recheck) {
              const spellingIssues = proofingEnabled
                ? SpellCheckerEngine.checkDocument(newEditorState.doc)
                : [];
              const grammarIssues = grammarEnabled
                ? GrammarCheckerEngine.checkDocument(newEditorState.doc)
                : [];
              const issues: ProofingIssue[] = [...spellingIssues, ...grammarIssues];

              return {
                issues,
                decorations: buildSpellingDecorations(newEditorState.doc, issues),
                lastCheckedDoc: newEditorState.doc,
              };
            }

            // Nếu document bị thay đổi do người dùng gõ
            if (tr.docChanged) {
              // Ánh xạ decorations theo mapping để tránh lệch vị trí tức thời
              const mappedDecos = pluginState.decorations.map(tr.mapping, tr.doc);
              const mappedIssues = pluginState.issues.map((iss) => ({
                ...iss,
                from: tr.mapping.map(iss.from),
                to: tr.mapping.map(iss.to),
              }));

              // Lên lịch kiểm tra lại sau khi ngừng gõ (debounce 350ms)
              if (debounceTimer) clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                if (editorView && !editorView.isDestroyed) {
                  editorView.dispatch(
                    editorView.state.tr.setMeta(spellCheckPluginKey, { recheck: true })
                  );
                }
              }, 350);

              return {
                issues: mappedIssues,
                decorations: mappedDecos,
                lastCheckedDoc: pluginState.lastCheckedDoc,
              };
            }

            return pluginState;
          },
        },

        props: {
          decorations(state) {
            return spellCheckPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },

          handleDOMEvents: {
            contextmenu(view, event) {
              const target = event.target as HTMLElement | null;
              const decoEl = target?.closest(
                ".spelling-error-decoration, .grammar-error-decoration"
              ) as HTMLElement | null;
              if (decoEl) {
                event.preventDefault();
                const issueId = decoEl.getAttribute("data-issue-id");
                const pluginState = spellCheckPluginKey.getState(view.state);
                const issue = pluginState?.issues.find((i) => i.id === issueId);
                if (issue) {
                  useReviewStore.getState().openSpellingContextMenu(issue, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                  return true;
                }
              }
              return false;
            },

            click(view, event) {
              const target = event.target as HTMLElement | null;
              const decoEl = target?.closest(
                ".spelling-error-decoration, .grammar-error-decoration"
              ) as HTMLElement | null;
              if (decoEl) {
                const issueId = decoEl.getAttribute("data-issue-id");
                const pluginState = spellCheckPluginKey.getState(view.state);
                const issue = pluginState?.issues.find((i) => i.id === issueId);
                if (issue) {
                  const rect = decoEl.getBoundingClientRect();
                  useReviewStore.getState().openSpellingContextMenu(issue, {
                    x: rect.left,
                    y: rect.bottom + 4,
                  });
                  return true;
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
