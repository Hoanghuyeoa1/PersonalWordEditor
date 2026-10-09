import { useCallback } from "react";
import { useEditorStore } from "../../stores/editorStore.ts";
import { useReferencesStore } from "../../stores/referencesStore.ts";
import type {
  ReferenceItemType,
  ReferenceCommandResult,
  ReferencePanelType,
} from "../types/referencesTypes.ts";
import {
  openReferencePanelCommand,
  closeReferencePanelCommand,
  toggleReferencePanelCommand,
  selectReferenceCommand,
  dispatchReferenceCommand,
} from "../commands/referencesCommands.ts";

/**
 * useReferencesCommands - Hook điều phối các lệnh References cho UI Components
 */
export function useReferencesCommands() {
  const editor = useEditorStore((state) => state.editor);
  const activeReferencePanel = useReferencesStore((state) => state.activeReferencePanel);
  const isReferencesPanelOpen = useReferencesStore((state) => state.isReferencesPanelOpen);
  const selectedReferenceId = useReferencesStore((state) => state.selectedReferenceId);

  const openPanel = useCallback((panel: ReferencePanelType): ReferenceCommandResult => {
    return openReferencePanelCommand(panel);
  }, []);

  const closePanel = useCallback((): ReferenceCommandResult => {
    return closeReferencePanelCommand();
  }, []);

  const togglePanel = useCallback((panel: ReferencePanelType): ReferenceCommandResult => {
    return toggleReferencePanelCommand(panel);
  }, []);

  const selectReference = useCallback((id: string | null): ReferenceCommandResult => {
    return selectReferenceCommand(id);
  }, []);

  const dispatchCommand = useCallback(
    (id: ReferenceItemType): ReferenceCommandResult => {
      return dispatchReferenceCommand(id, editor);
    },
    [editor]
  );

  return {
    editor,
    activeReferencePanel,
    isReferencesPanelOpen,
    selectedReferenceId,
    openPanel,
    closePanel,
    togglePanel,
    selectReference,
    dispatchCommand,
  };
}
