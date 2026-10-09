import { useInsertDialogStore } from "../../stores/insertDialogStore.ts";
import { useInsertCommands } from "../../insert/hooks/useInsertCommands.ts";
import { EquationDialog } from "./EquationDialog.tsx";

/**
 * Connected Modal Component kết nối EquationDialog với Zustand store và Tiptap editor.
 */
export function EquationModal() {
  const isOpen = useInsertDialogStore((state) => state.isEquationDialogOpen);
  const initialLatex = useInsertDialogStore((state) => state.equationInitialLatex);
  const close = useInsertDialogStore((state) => state.closeEquationDialog);
  const { insertEquation, updateEquation, isEquationActive } = useInsertCommands();

  const isEditing = isEquationActive();

  const handleApply = (latex: string, alignment: "left" | "center" | "right") => {
    if (isEditing) {
      updateEquation(latex);
    } else {
      insertEquation({ latex, alignment });
    }
  };

  return (
    <EquationDialog
      isOpen={isOpen}
      initialLatex={initialLatex}
      isEditing={isEditing}
      onClose={close}
      onApply={handleApply}
    />
  );
}

export default EquationModal;
