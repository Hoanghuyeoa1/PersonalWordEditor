import type { JSONContent, Editor } from "@tiptap/core";
import type { DocumentStyle } from "../types/styleTypes.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { updateDocumentStylesStylesheet } from "./styleStylesheetService.ts";

export type StyleActionType =
  | "create"
  | "update"
  | "rename"
  | "duplicate"
  | "delete"
  | "update_from_selection";

export interface StyleHistorySnapshot {
  action: StyleActionType;
  description: string;
  styleId: string;
  beforeDefinitions: DocumentStyle[];
  afterDefinitions: DocumentStyle[];
  beforeContent?: JSONContent;
  afterContent?: JSONContent;
}

class StyleHistoryManager {
  private undoStack: StyleHistorySnapshot[] = [];
  private redoStack: StyleHistorySnapshot[] = [];
  private readonly maxDepth: number = 50;

  /**
   * Ghi nhận một thao tác thay đổi Style Definition vào lịch sử Undo.
   */
  public recordAction(snapshot: StyleHistorySnapshot): void {
    // Clone sâu definitions để tránh mutation tham chiếu
    const record: StyleHistorySnapshot = {
      ...snapshot,
      beforeDefinitions: JSON.parse(JSON.stringify(snapshot.beforeDefinitions)),
      afterDefinitions: JSON.parse(JSON.stringify(snapshot.afterDefinitions)),
      beforeContent: snapshot.beforeContent ? JSON.parse(JSON.stringify(snapshot.beforeContent)) : undefined,
      afterContent: snapshot.afterContent ? JSON.parse(JSON.stringify(snapshot.afterContent)) : undefined,
    };

    this.undoStack.push(record);
    this.redoStack = [];

    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
  }

  /**
   * Hoàn tác (Undo) thao tác Style Definition gần nhất.
   */
  public undo(editor?: Editor | null): boolean {
    if (this.undoStack.length === 0) {
      return false;
    }

    const snapshot = this.undoStack.pop()!;
    this.redoStack.push(snapshot);

    // 1. Phục hồi Style Definitions trong Document Store & Stylesheet
    const store = useDocumentStore.getState();
    const restoredDefs = JSON.parse(JSON.stringify(snapshot.beforeDefinitions));
    store.updateStyleDefinitions(restoredDefs);
    updateDocumentStylesStylesheet(restoredDefs);

    // 2. Phục hồi Document AST (nếu thao tác có biến đổi AST như delete style reassign)
    if (snapshot.beforeContent) {
      const restoredContent = JSON.parse(JSON.stringify(snapshot.beforeContent));
      if (editor && editor.commands) {
        editor.commands.setContent(restoredContent);
      }
      store.updateContent(restoredContent);
    }

    // Đánh dấu dirty state
    useDocumentStore.setState({ isDirty: true, isModified: true });
    return true;
  }

  /**
   * Làm lại (Redo) thao tác Style Definition vừa hoàn tác.
   */
  public redo(editor?: Editor | null): boolean {
    if (this.redoStack.length === 0) {
      return false;
    }

    const snapshot = this.redoStack.pop()!;
    this.undoStack.push(snapshot);

    // 1. Phục hồi Style Definitions
    const store = useDocumentStore.getState();
    const restoredDefs = JSON.parse(JSON.stringify(snapshot.afterDefinitions));
    store.updateStyleDefinitions(restoredDefs);
    updateDocumentStylesStylesheet(restoredDefs);

    // 2. Phục hồi Document AST
    if (snapshot.afterContent) {
      const restoredContent = JSON.parse(JSON.stringify(snapshot.afterContent));
      if (editor && editor.commands) {
        editor.commands.setContent(restoredContent);
      }
      store.updateContent(restoredContent);
    }

    // Đánh dấu dirty state
    useDocumentStore.setState({ isDirty: true, isModified: true });
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  public getUndoStackSize(): number {
    return this.undoStack.length;
  }

  public getRedoStackSize(): number {
    return this.redoStack.length;
  }
}

export const styleHistory = new StyleHistoryManager();
export const undoStyle = (editor?: Editor | null) => styleHistory.undo(editor);
export const redoStyle = (editor?: Editor | null) => styleHistory.redo(editor);
export const canUndoStyle = () => styleHistory.canUndo();
export const canRedoStyle = () => styleHistory.canRedo();
export const clearStyleHistory = () => styleHistory.clear();
