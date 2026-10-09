import { Minimize2 } from "lucide-react";
import { useFocusModeStore } from "../../stores/focusModeStore.ts";

/**
 * FocusModeExitButton - Nút điều khiển thoát Focus Mode tinh tế (Phase 7.3 Architecture)
 *
 * Tiêu chí thiết kế:
 * - Không gây xao nhãng khi đang viết (độ trong suốt thấp khi không hover).
 * - Luôn luôn có thể nhìn thấy và truy cập được ở góc trên màn hình.
 * - Hỗ trợ gợi ý phím tắt Esc rõ ràng để người dùng không bao giờ bị "kẹt" trong Focus Mode.
 */
export function FocusModeExitButton() {
  const isFocusMode = useFocusModeStore((state) => state.isFocusMode);
  const exitFocusMode = useFocusModeStore((state) => state.exitFocusMode);

  if (!isFocusMode) {
    return null;
  }

  return (
    <aside className="focus-mode-exit-container" aria-label="Điều khiển chế độ tập trung">
      <button
        type="button"
        className="focus-mode-exit-btn"
        onClick={exitFocusMode}
        title="Thoát chế độ tập trung (phím Esc hoặc F11)"
        aria-label="Thoát chế độ tập trung (phím Esc)"
      >
        <Minimize2 size={14} className="focus-mode-exit-icon" aria-hidden="true" />
        <span className="focus-mode-exit-text">Thoát tập trung</span>
        <kbd className="focus-mode-exit-kbd">Esc</kbd>
      </button>
    </aside>
  );
}
