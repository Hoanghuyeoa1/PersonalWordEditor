import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import { useEditorStore } from "../stores/editorStore.ts";
import { PageRenderer } from "../page/components/PageRenderer.tsx";
import { DocumentNotesView } from "../references/components/DocumentNotesView.tsx";

export interface EditorProps {
  /** Nội dung khởi tạo của tài liệu dạng Tiptap JSON */
  initialContent?: JSONContent;
  /** Callback được gọi khi nội dung JSON trong editor thay đổi */
  onContentChange?: (content: JSONContent) => void;
  /** Callback trả về instance Editor khi khởi tạo xong */
  onEditorReady?: (editor: TiptapEditor | null) => void;
  /** Chế độ chỉ đọc */
  readOnly?: boolean;
  /** ClassName tùy chỉnh cho container trang */
  className?: string;
}

export function Editor({
  initialContent,
  onContentChange,
  onEditorReady,
  readOnly = false,
  className = "",
}: EditorProps) {
  const setStoreEditor = useEditorStore((state) => state.setEditor);

  const editor = useEditor({
    extensions: getEditorExtensions(),
    content: initialContent,
    editable: !readOnly,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: "word-editor-body",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) => {
      if (onContentChange) {
        onContentChange(editor.getJSON());
      }
    },
  });

  useEffect(() => {
    setStoreEditor(editor);
    if (onEditorReady) {
      onEditorReady(editor);
    }
    return () => {
      setStoreEditor(null);
      if (onEditorReady) {
        onEditorReady(null);
      }
    };
  }, [editor, onEditorReady, setStoreEditor]);

  return (
    <PageRenderer editor={editor} className={className}>
      <EditorContent editor={editor} className="tiptap-container" />
      <DocumentNotesView editor={editor} />
    </PageRenderer>
  );
}

export default Editor;
