import { useEditorStore } from "../../stores/editorStore.ts";
import { useInsertDialogStore } from "../../stores/insertDialogStore.ts";
import { HyperlinkDialog } from "./HyperlinkDialog.tsx";
import { getActiveLinkInfo, getSelectedText } from "../../insert/services/linkService.ts";
import { updateOrInsertLink, unsetLink } from "../../editor/editorCommands.ts";

/**
 * Container component kết nối HyperlinkDialog với Zustand store và Tiptap editor.
 */
export function HyperlinkModal() {
  const editor = useEditorStore((state) => state.editor);
  const isOpen = useInsertDialogStore((state) => state.isLinkDialogOpen);
  const close = useInsertDialogStore((state) => state.closeLinkDialog);

  const linkInfo = editor ? getActiveLinkInfo(editor) : null;
  const selectedText = editor ? getSelectedText(editor) : "";

  const isEditing = Boolean(linkInfo);
  const initialText = linkInfo?.text || selectedText || "";
  const initialUrl = linkInfo?.href || "";

  const handleApply = (text: string, url: string) => {
    if (editor) {
      updateOrInsertLink(editor, text, url);
      editor.commands.focus();
    }
  };

  const handleRemove = () => {
    if (editor) {
      unsetLink(editor);
      editor.commands.focus();
    }
  };

  return (
    <HyperlinkDialog
      isOpen={isOpen}
      initialText={initialText}
      initialUrl={initialUrl}
      isEditing={isEditing}
      onClose={close}
      onApply={handleApply}
      onRemove={handleRemove}
    />
  );
}

export default HyperlinkModal;
