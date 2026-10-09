import { useInsertDialogStore } from "../../stores/insertDialogStore.ts";
import { useInsertCommands } from "../../insert/hooks/useInsertCommands.ts";
import { TableInsertDialog } from "./TableInsertDialog.tsx";

/**
 * Connected Modal Component kết nối TableInsertDialog với Zustand store và Tiptap editor.
 */
export function TableModal() {
  const isOpen = useInsertDialogStore((state) => state.isTableDialogOpen);
  const close = useInsertDialogStore((state) => state.closeTableDialog);
  const { insertTable } = useInsertCommands();

  const handleApply = (rows: number, cols: number, withHeaderRow: boolean) => {
    insertTable({ rows, cols, withHeaderRow });
  };

  return (
    <TableInsertDialog
      isOpen={isOpen}
      onClose={close}
      onApply={handleApply}
    />
  );
}

export default TableModal;
