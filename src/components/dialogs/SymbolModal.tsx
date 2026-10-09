import { useEditorStore } from "../../stores/editorStore.ts";
import { useInsertDialogStore } from "../../stores/insertDialogStore.ts";
import { SymbolDialog } from "./SymbolDialog.tsx";
import { insertSymbol } from "../../editor/editorCommands.ts";

/**
 * Container component kết nối SymbolDialog với Zustand store và Tiptap editor.
 */
export function SymbolModal() {
  const editor = useEditorStore((state) => state.editor);
  const isOpen = useInsertDialogStore((state) => state.isSymbolDialogOpen);
  const close = useInsertDialogStore((state) => state.closeSymbolDialog);

  const handleSelect = (symbol: string) => {
    if (editor) {
      insertSymbol(editor, symbol);
      editor.commands.focus();
    }
  };

  return (
    <SymbolDialog
      isOpen={isOpen}
      onClose={close}
      onSelect={handleSelect}
    />
  );
}

export default SymbolModal;
