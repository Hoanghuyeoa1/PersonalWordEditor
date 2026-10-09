import { useCallback } from "react";
import { useEditorStore } from "../../stores/editorStore.ts";
import type {
  InsertItemType,
  InsertCommandResult,
} from "../types/insertTypes.ts";
import {
  canInsertItem,
  dispatchInsertCommand,
  executeInsertPageBreak,
  executeInsertSectionBreak,
  executeInsertHorizontalRule,
  executeInsertSymbol,
  executeInsertLink,
  executeInsertTable,
} from "../commands/insertCommands.ts";
import {
  unsetLink as editorUnsetLink,
  isLinkActive as editorIsLinkActive,
  addRowAbove as editorAddRowAbove,
  addRowBelow as editorAddRowBelow,
  deleteRow as editorDeleteRow,
  addColumnLeft as editorAddColumnLeft,
  addColumnRight as editorAddColumnRight,
  deleteColumn as editorDeleteColumn,
  deleteTable as editorDeleteTable,
  toggleHeaderRow as editorToggleHeaderRow,
  isTableActive as editorIsTableActive,
  mergeCells as editorMergeCells,
  canMergeCells as editorCanMergeCells,
  splitCell as editorSplitCell,
  canSplitCell as editorCanSplitCell,
  setCellTextAlign as editorSetCellTextAlign,
  setCellVerticalAlign as editorSetCellVerticalAlign,
  setCellBackgroundColor as editorSetCellBackgroundColor,
  setTableBorders as editorSetTableBorders,
  getTableBorders as editorGetTableBorders,
  insertImage as editorInsertImage,
  deleteImage as editorDeleteImage,
  setImageDimensions as editorSetImageDimensions,
  setImageAlignment as editorSetImageAlignment,
  setImageAlt as editorSetImageAlt,
  isImageActive as editorIsImageActive,
  insertTextBox as editorInsertTextBox,
  deleteTextBox as editorDeleteTextBox,
  setTextBoxWidth as editorSetTextBoxWidth,
  setTextBoxAlignment as editorSetTextBoxAlignment,
  isTextBoxActive as editorIsTextBoxActive,
  insertShape as editorInsertShape,
  deleteShape as editorDeleteShape,
  setShapeDimensions as editorSetShapeDimensions,
  setShapeFillColor as editorSetShapeFillColor,
  setShapeStrokeColor as editorSetShapeStrokeColor,
  setShapeStrokeWidth as editorSetShapeStrokeWidth,
  setShapeAlignment as editorSetShapeAlignment,
  isShapeActive as editorIsShapeActive,
  insertEquation as editorInsertEquation,
  updateEquation as editorUpdateEquation,
  deleteEquation as editorDeleteEquation,
  setEquationAlignment as editorSetEquationAlignment,
  isEquationActive as editorIsEquationActive,
} from "../../editor/editorCommands.ts";
import { getActiveLinkInfo as getLinkInfo } from "../services/linkService.ts";

/**
 * Hook kết nối giao diện Ribbon với Insert Command Layer.
 * Tuân thủ nghiêm ngặt luồng:
 * Ribbon UI -> Hook -> Insert Command -> Tiptap/ProseMirror -> Document Model
 */
export function useInsertCommands() {
  const editor = useEditorStore((state) => state.editor);

  const canInsert = useCallback(
    (itemType: InsertItemType) => {
      return canInsertItem(editor, itemType);
    },
    [editor]
  );

  const dispatch = useCallback(
    (itemType: InsertItemType, payload?: unknown): InsertCommandResult => {
      return dispatchInsertCommand(editor, itemType, payload);
    },
    [editor]
  );

  const insertPageBreak = useCallback(() => {
    return executeInsertPageBreak(editor);
  }, [editor]);

  const insertSectionBreak = useCallback(
    (options?: { pageSettings?: import("../../page/types/pageTypes.ts").PageSettings }) => {
      return executeInsertSectionBreak(editor, options);
    },
    [editor]
  );

  const insertHorizontalRule = useCallback(() => {
    return executeInsertHorizontalRule(editor);
  }, [editor]);

  const insertSymbol = useCallback(
    (symbol: string) => {
      return executeInsertSymbol(editor, { symbol });
    },
    [editor]
  );

  const updateOrInsertLink = useCallback(
    (text: string, url: string) => {
      return executeInsertLink(editor, { text, url });
    },
    [editor]
  );

  const unsetLink = useCallback(() => {
    return editorUnsetLink(editor);
  }, [editor]);

  const isLinkActive = useCallback(() => {
    return editorIsLinkActive(editor);
  }, [editor]);

  const getActiveLinkInfo = useCallback(() => {
    return getLinkInfo(editor);
  }, [editor]);

  const insertTable = useCallback(
    (options?: { rows: number; cols: number; withHeaderRow?: boolean }) => {
      return executeInsertTable(editor, options);
    },
    [editor]
  );

  const addRowAbove = useCallback(() => {
    return editorAddRowAbove(editor);
  }, [editor]);

  const addRowBelow = useCallback(() => {
    return editorAddRowBelow(editor);
  }, [editor]);

  const deleteRow = useCallback(() => {
    return editorDeleteRow(editor);
  }, [editor]);

  const addColumnLeft = useCallback(() => {
    return editorAddColumnLeft(editor);
  }, [editor]);

  const addColumnRight = useCallback(() => {
    return editorAddColumnRight(editor);
  }, [editor]);

  const deleteColumn = useCallback(() => {
    return editorDeleteColumn(editor);
  }, [editor]);

  const deleteTable = useCallback(() => {
    return editorDeleteTable(editor);
  }, [editor]);

  const toggleHeaderRow = useCallback(() => {
    return editorToggleHeaderRow(editor);
  }, [editor]);

  const isTableActive = useCallback(() => {
    return editorIsTableActive(editor);
  }, [editor]);

  const mergeCells = useCallback(() => {
    return editorMergeCells(editor);
  }, [editor]);

  const canMergeCells = useCallback(() => {
    return editorCanMergeCells(editor);
  }, [editor]);

  const splitCell = useCallback(() => {
    return editorSplitCell(editor);
  }, [editor]);

  const canSplitCell = useCallback(() => {
    return editorCanSplitCell(editor);
  }, [editor]);

  const setCellTextAlign = useCallback(
    (align: "left" | "center" | "right") => {
      return editorSetCellTextAlign(editor, align);
    },
    [editor]
  );

  const setCellVerticalAlign = useCallback(
    (vAlign: "top" | "middle" | "bottom") => {
      return editorSetCellVerticalAlign(editor, vAlign);
    },
    [editor]
  );

  const setCellBackgroundColor = useCallback(
    (color: string | null) => {
      return editorSetCellBackgroundColor(editor, color);
    },
    [editor]
  );

  const setTableBorders = useCallback(
    (borders: "all" | "none" | "outside") => {
      return editorSetTableBorders(editor, borders);
    },
    [editor]
  );

  const getTableBorders = useCallback(() => {
    return editorGetTableBorders(editor);
  }, [editor]);

  return {
    editor,
    canInsert,
    dispatch,
    insertPageBreak,
    insertSectionBreak,
    insertHorizontalRule,
    insertSymbol,
    updateOrInsertLink,
    unsetLink,
    isLinkActive,
    getActiveLinkInfo,
    insertTable,
    addRowAbove,
    addRowBelow,
    deleteRow,
    addColumnLeft,
    addColumnRight,
    deleteColumn,
    deleteTable,
    toggleHeaderRow,
    isTableActive,
    mergeCells,
    canMergeCells,
    splitCell,
    canSplitCell,
    setCellTextAlign,
    setCellVerticalAlign,
    setCellBackgroundColor,
    setTableBorders,
    getTableBorders,
    insertImage: (options: Parameters<typeof editorInsertImage>[1]) =>
      editorInsertImage(editor, options),
    deleteImage: () => editorDeleteImage(editor),
    setImageDimensions: (width: number, height: number) =>
      editorSetImageDimensions(editor, width, height),
    setImageAlignment: (alignment: import("../../editor/imageExtension.ts").ImageAlignment) =>
      editorSetImageAlignment(editor, alignment),
    setImageAlt: (alt: string) => editorSetImageAlt(editor, alt),
    isImageActive: () => editorIsImageActive(editor),
    insertTextBox: (options?: { width?: number; initialText?: string }) =>
      editorInsertTextBox(editor, options),
    deleteTextBox: () => editorDeleteTextBox(editor),
    setTextBoxWidth: (width: number) => editorSetTextBoxWidth(editor, width),
    setTextBoxAlignment: (alignment: "left" | "center" | "right") =>
      editorSetTextBoxAlignment(editor, alignment),
    isTextBoxActive: () => editorIsTextBoxActive(editor),
    insertShape: (options?: Parameters<typeof editorInsertShape>[1]) =>
      editorInsertShape(editor, options),
    deleteShape: () => editorDeleteShape(editor),
    setShapeDimensions: (width: number, height: number) =>
      editorSetShapeDimensions(editor, width, height),
    setShapeFillColor: (fillColor: string) =>
      editorSetShapeFillColor(editor, fillColor),
    setShapeStrokeColor: (strokeColor: string) =>
      editorSetShapeStrokeColor(editor, strokeColor),
    setShapeStrokeWidth: (strokeWidth: number) =>
      editorSetShapeStrokeWidth(editor, strokeWidth),
    setShapeAlignment: (alignment: "left" | "center" | "right") =>
      editorSetShapeAlignment(editor, alignment),
    isShapeActive: () => editorIsShapeActive(editor),
    insertEquation: (options?: Parameters<typeof editorInsertEquation>[1]) =>
      editorInsertEquation(editor, options),
    updateEquation: (latex: string) =>
      editorUpdateEquation(editor, latex),
    deleteEquation: () => editorDeleteEquation(editor),
    setEquationAlignment: (alignment: "left" | "center" | "right") =>
      editorSetEquationAlignment(editor, alignment),
    isEquationActive: () => editorIsEquationActive(editor),
  };
}
