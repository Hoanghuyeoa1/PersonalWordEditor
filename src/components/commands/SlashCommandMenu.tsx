import { useMemo, useEffect, useRef } from "react";
import { useSlashCommandStore } from "../../stores/slashCommandStore.ts";
import { useEditorStore } from "../../stores/editorStore.ts";
import { commandRegistry } from "../../commands/commandRegistry.ts";
import { executeCommandWithSelection } from "../../commands/commandExecution.ts";
import { CommandIcon } from "./CommandIcons.tsx";

export function SlashCommandMenu() {
  const {
    isOpen,
    query,
    selectedIndex,
    position,
    triggerRange,
    closeSlashMenu,
    setSelectedIndex,
  } = useSlashCommandStore();

  const editor = useEditorStore((state) => state.editor);
  const menuRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    return commandRegistry.search(query, { slashOnly: true });
  }, [query]);

  // Cuộn mục đang chọn vào tầm nhìn
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const activeEl = menuRef.current.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen || !position) return null;

  // Tính toán vị trí hiển thị an toàn trong khung hình (Viewport bounds clamping)
  const menuWidth = 320;
  const menuHeight = Math.min(results.length * 48 + 50, 360);

  let left = position.x;
  let top = position.y;

  if (typeof window !== "undefined") {
    if (left + menuWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - menuWidth - 16);
    }
    if (top + menuHeight > window.innerHeight - 16) {
      // Đảo chiều hiển thị lên trên con trỏ nếu chạm đáy
      top = Math.max(16, position.y - menuHeight - 24);
    }
  }

  const handleItemClick = (cmdId: string) => {
    closeSlashMenu();
    executeCommandWithSelection(cmdId, {
      editor,
      rangeToDelete: triggerRange,
    });
  };

  return (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={{ left: `${left}px`, top: `${top}px` }}
      role="listbox"
      aria-label="Slash Commands Menu"
    >
      <div className="slash-menu-header">
        <span className="slash-menu-title">Lệnh nhanh</span>
        {query && <span className="slash-menu-query">"{query}"</span>}
      </div>

      <div className="slash-menu-list-wrapper">
        {results.length === 0 ? (
          <div className="slash-menu-empty">
            Không tìm thấy lệnh nào phù hợp cho "/{query}"
          </div>
        ) : (
          <ul className="slash-menu-list">
            {results.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const canRun = !cmd.canExecute || cmd.canExecute({ editor });

              return (
                <li
                  key={cmd.id}
                  data-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={!canRun}
                  className={`slash-menu-item ${isSelected ? "selected" : ""} ${
                    !canRun ? "disabled" : ""
                  }`}
                  onClick={() => canRun && handleItemClick(cmd.id)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="slash-menu-item-icon">
                    <CommandIcon name={cmd.icon} size={15} />
                  </div>

                  <div className="slash-menu-item-info">
                    <div className="slash-menu-item-label">{cmd.label}</div>
                    {cmd.description && (
                      <div className="slash-menu-item-desc">{cmd.description}</div>
                    )}
                  </div>

                  {cmd.shortcut && (
                    <div className="slash-menu-item-shortcut">
                      <kbd>{cmd.shortcut}</kbd>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="slash-menu-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> chọn</span>
        <span><kbd>↵</kbd> chạy</span>
        <span><kbd>Esc</kbd> thoát</span>
      </div>
    </div>
  );
}
