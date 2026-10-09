import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { useReviewStore } from "../stores/reviewStore.ts";

export interface SearchMatch {
  from: number;
  to: number;
  text?: string;
}

export interface SearchPluginState {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  currentIndex: number;
  decorations: DecorationSet;
}

export const searchPluginKey = new PluginKey<SearchPluginState>("personalWordSearch");

/**
 * Tìm tất cả các vị trí trùng khớp của từ khóa trong tài liệu ProseMirror.
 * Quét qua toàn bộ textblock (đoạn văn, tiêu đề, danh sách) và ánh xạ chính xác
 * chỉ số ký tự thành vị trí absolute trong document, hỗ trợ cả chuỗi vắt qua nhiều text nodes có định dạng khác nhau.
 */
export function findMatches(
  doc: Node,
  searchTerm: string,
  caseSensitive = false
): SearchMatch[] {
  if (!searchTerm) return [];

  const matches: SearchMatch[] = [];
  const query = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      let blockText = "";
      const charToPos: number[] = [];

      node.forEach((child, offset) => {
        if (child.isText && child.text) {
          const startPos = pos + 1 + offset;
          for (let i = 0; i < child.text.length; i++) {
            charToPos.push(startPos + i);
          }
          blockText += child.text;
        }
      });

      if (!blockText) return false;

      const searchTarget = caseSensitive ? blockText : blockText.toLowerCase();
      let index = 0;
      while (index < searchTarget.length) {
        const foundIndex = searchTarget.indexOf(query, index);
        if (foundIndex === -1) break;

        const from = charToPos[foundIndex];
        const to = charToPos[foundIndex + query.length - 1] + 1;

        matches.push({
          from,
          to,
          text: blockText.substring(foundIndex, foundIndex + query.length),
        });

        index = foundIndex + (query.length || 1);
      }

      return false; // Không duyệt sâu hơn vào con inline của textblock
    }
    return true;
  });

  return matches;
}

/**
 * Tạo DecorationSet để tô màu highlight tạm thời cho các kết quả tìm kiếm.
 * Hoàn toàn không ghi đè hay thay đổi cấu trúc Document AST.
 */
export function buildDecorations(
  doc: Node,
  matches: SearchMatch[],
  currentIndex: number
): DecorationSet {
  if (!matches.length) {
    return DecorationSet.empty;
  }

  const decos: Decoration[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const isActive = i === currentIndex;
    decos.push(
      Decoration.inline(match.from, match.to, {
        class: isActive ? "search-match search-match-active" : "search-match",
      })
    );
  }

  return DecorationSet.create(doc, decos);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchAndReplace: {
      /** Thiết lập từ khóa tìm kiếm */
      setSearchTerm: (searchTerm: string, caseSensitive?: boolean) => ReturnType;
      /** Thiết lập chuỗi thay thế */
      setReplaceTerm: (replaceTerm: string) => ReturnType;
      /** Bật/tắt phân biệt hoa thường */
      setCaseSensitive: (caseSensitive: boolean) => ReturnType;
      /** Nhảy đến kết quả tiếp theo */
      goToNextMatch: () => ReturnType;
      /** Nhảy về kết quả trước đó */
      goToPreviousMatch: () => ReturnType;
      /** Thay thế kết quả hiện tại */
      replaceCurrentMatch: (replacement?: string) => ReturnType;
      /** Thay thế tất cả kết quả */
      replaceAllMatches: (replacement?: string) => ReturnType;
      /** Dọn dẹp tìm kiếm và xóa decorations */
      clearSearch: () => ReturnType;
    };
  }
}

export const SearchAndReplace = Extension.create({
  name: "searchAndReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,
        state: {
          init: () => ({
            searchTerm: "",
            replaceTerm: "",
            caseSensitive: false,
            matches: [],
            currentIndex: -1,
            decorations: DecorationSet.empty,
          }),
          apply: (tr, oldState, _oldEditorState, newEditorState) => {
            const meta = tr.getMeta(searchPluginKey);

            // Xử lý khi có meta command được gửi qua transaction
            if (meta) {
              if (meta.type === "clear") {
                return {
                  searchTerm: "",
                  replaceTerm: "",
                  caseSensitive: false,
                  matches: [],
                  currentIndex: -1,
                  decorations: DecorationSet.empty,
                };
              }

              if (meta.type === "setSearch") {
                const searchTerm = meta.searchTerm ?? oldState.searchTerm;
                const caseSensitive = meta.caseSensitive ?? oldState.caseSensitive;
                const matches = findMatches(newEditorState.doc, searchTerm, caseSensitive);
                const currentIndex = matches.length > 0 ? 0 : -1;
                const decorations = buildDecorations(newEditorState.doc, matches, currentIndex);

                return {
                  ...oldState,
                  searchTerm,
                  caseSensitive,
                  matches,
                  currentIndex,
                  decorations,
                };
              }

              if (meta.type === "setReplace") {
                return {
                  ...oldState,
                  replaceTerm: meta.replaceTerm,
                };
              }

              if (meta.type === "setCurrentIndex") {
                const currentIndex = meta.currentIndex;
                const decorations = buildDecorations(
                  newEditorState.doc,
                  oldState.matches,
                  currentIndex
                );
                return {
                  ...oldState,
                  currentIndex,
                  decorations,
                };
              }
            }

            // Nếu document bị thay đổi do người dùng gõ / xóa trong khi đang tìm kiếm
            if (tr.docChanged && oldState.searchTerm) {
              const matches = findMatches(
                newEditorState.doc,
                oldState.searchTerm,
                oldState.caseSensitive
              );
              let currentIndex = oldState.currentIndex;
              if (matches.length === 0) {
                currentIndex = -1;
              } else if (currentIndex >= matches.length) {
                currentIndex = 0;
              }
              const decorations = buildDecorations(newEditorState.doc, matches, currentIndex);

              return {
                ...oldState,
                matches,
                currentIndex,
                decorations,
              };
            }

            return oldState;
          },
        },
        props: {
          decorations: (state) => {
            return searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSearchTerm:
        (searchTerm: string, caseSensitive?: boolean) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(searchPluginKey, {
            type: "setSearch",
            searchTerm,
            caseSensitive,
          });
          dispatch(tr);
          return true;
        },

      setReplaceTerm:
        (replaceTerm: string) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(searchPluginKey, {
            type: "setReplace",
            replaceTerm,
          });
          dispatch(tr);
          return true;
        },

      setCaseSensitive:
        (caseSensitive: boolean) =>
        ({ tr, state, dispatch }) => {
          const current = searchPluginKey.getState(state);
          if (!dispatch || !current) return true;
          tr.setMeta(searchPluginKey, {
            type: "setSearch",
            searchTerm: current.searchTerm,
            caseSensitive,
          });
          dispatch(tr);
          return true;
        },

      goToNextMatch:
        () =>
        ({ tr, state, dispatch }) => {
          const pluginState = searchPluginKey.getState(state);
          if (!pluginState || pluginState.matches.length === 0) return false;

          const nextIndex =
            (pluginState.currentIndex + 1) % pluginState.matches.length;
          const match = pluginState.matches[nextIndex];

          tr.setMeta(searchPluginKey, {
            type: "setCurrentIndex",
            currentIndex: nextIndex,
          });

          // Di chuyển con trỏ và scroll đến vị trí kết quả
          tr.setSelection(TextSelection.create(tr.doc, match.from, match.to));
          tr.scrollIntoView();

          if (dispatch) dispatch(tr);
          return true;
        },

      goToPreviousMatch:
        () =>
        ({ tr, state, dispatch }) => {
          const pluginState = searchPluginKey.getState(state);
          if (!pluginState || pluginState.matches.length === 0) return false;

          const prevIndex =
            (pluginState.currentIndex - 1 + pluginState.matches.length) %
            pluginState.matches.length;
          const match = pluginState.matches[prevIndex];

          tr.setMeta(searchPluginKey, {
            type: "setCurrentIndex",
            currentIndex: prevIndex,
          });

          tr.setSelection(TextSelection.create(tr.doc, match.from, match.to));
          tr.scrollIntoView();

          if (dispatch) dispatch(tr);
          return true;
        },

      replaceCurrentMatch:
        (replacement?: string) =>
        ({ tr, state, dispatch }) => {
          const pluginState = searchPluginKey.getState(state);
          if (!pluginState || pluginState.matches.length === 0 || pluginState.currentIndex < 0) {
            return false;
          }

          const match = pluginState.matches[pluginState.currentIndex];
          const replaceText = replacement !== undefined ? replacement : pluginState.replaceTerm;

          const isTracking = useReviewStore.getState().trackChangesEnabled;
          const markType = state.schema.marks.trackChange;

          if (isTracking && markType) {
            const author = "Author";
            const timestamp = new Date().toISOString();
            const delId = `change-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
            tr.addMark(match.from, match.to, delMark);

            if (replaceText) {
              const insId = `change-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
              const insMark = markType.create({ id: insId, changeType: "insert", author, timestamp });
              tr.insertText(replaceText, match.to);
              tr.removeMark(match.to, match.to + replaceText.length, markType);
              tr.addMark(match.to, match.to + replaceText.length, insMark);
            }
          } else {
            tr.insertText(replaceText, match.from, match.to);
          }

          if (dispatch) {
            dispatch(tr);
          }
          return true;
        },

      replaceAllMatches:
        (replacement?: string) =>
        ({ tr, state, dispatch }) => {
          const pluginState = searchPluginKey.getState(state);
          if (!pluginState || pluginState.matches.length === 0) {
            return false;
          }

          const replaceText = replacement !== undefined ? replacement : pluginState.replaceTerm;
          const matches = [...pluginState.matches];

          const isTracking = useReviewStore.getState().trackChangesEnabled;
          const markType = state.schema.marks.trackChange;

          // Thay thế theo thứ tự từ cuối lên đầu để không làm lệch offset của các vị trí trước
          for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            if (isTracking && markType) {
              const author = "Author";
              const timestamp = new Date().toISOString();
              const delId = `change-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
              const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
              tr.addMark(m.from, m.to, delMark);

              if (replaceText) {
                const insId = `change-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                const insMark = markType.create({ id: insId, changeType: "insert", author, timestamp });
                tr.insertText(replaceText, m.to);
                tr.removeMark(m.to, m.to + replaceText.length, markType);
                tr.addMark(m.to, m.to + replaceText.length, insMark);
              }
            } else {
              tr.insertText(replaceText, m.from, m.to);
            }
          }

          if (dispatch) {
            dispatch(tr);
          }
          return true;
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(searchPluginKey, { type: "clear" });
          dispatch(tr);
          return true;
        },
    };
  },
});
