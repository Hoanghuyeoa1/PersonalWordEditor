import { useCallback } from "react";
import { useEditorStore } from "../../stores/editorStore.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import type { ReviewItemType } from "../types/reviewTypes.ts";
import {
  dispatchReviewCommand,
  openDocumentStatisticsCommand,
  toggleTrackChangesCommand,
} from "../commands/reviewCommands.ts";

/**
 * useReviewCommands - Hook tương tác với Review Engine
 */
export function useReviewCommands() {
  const editor = useEditorStore((state) => state.editor);
  const proofingEnabled = useReviewStore((state) => state.proofingEnabled);
  const trackChangesEnabled = useReviewStore((state) => state.trackChangesEnabled);
  const activeCommentId = useReviewStore((state) => state.activeCommentId);
  const activeChangeId = useReviewStore((state) => state.activeChangeId);

  const openDocumentStatistics = useCallback(() => {
    return openDocumentStatisticsCommand();
  }, []);

  const toggleTrackChanges = useCallback(() => {
    return toggleTrackChangesCommand();
  }, []);

  const executeCommand = useCallback(
    (itemId: ReviewItemType) => {
      return dispatchReviewCommand(itemId, editor);
    },
    [editor]
  );

  return {
    editor,
    proofingEnabled,
    trackChangesEnabled,
    activeCommentId,
    activeChangeId,
    openDocumentStatistics,
    toggleTrackChanges,
    executeCommand,
  };
}
