import { create } from "zustand";

export interface ZoomState {
  /** Mức độ thu phóng trang (tính theo phần trăm, từ 50 đến 200) */
  zoom: number;
  /** Thiết lập mức thu phóng trực tiếp */
  setZoom: (zoom: number) => void;
  /** Phóng to 1 bước (+10%) */
  zoomIn: () => void;
  /** Thu nhỏ 1 bước (-10%) */
  zoomOut: () => void;
  /** Đặt lại mức thu phóng mặc định 100% */
  resetZoom: () => void;
}

export const MIN_ZOOM = 50;
export const MAX_ZOOM = 200;
export const DEFAULT_ZOOM = 100;
export const ZOOM_STEP = 10;

export const useZoomStore = create<ZoomState>((set) => ({
  zoom: DEFAULT_ZOOM,

  setZoom: (value) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)));
    set({ zoom: clamped });
  },

  zoomIn: () =>
    set((state) => ({
      zoom: Math.min(MAX_ZOOM, state.zoom + ZOOM_STEP),
    })),

  zoomOut: () =>
    set((state) => ({
      zoom: Math.max(MIN_ZOOM, state.zoom - ZOOM_STEP),
    })),

  resetZoom: () => set({ zoom: DEFAULT_ZOOM }),
}));
