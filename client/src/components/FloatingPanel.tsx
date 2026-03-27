/*
 * FloatingPanel — Draggable + Resizable container for overlay panels.
 * Cartographic Studio Design: glass-panel aesthetic with subtle drag/resize affordances.
 *
 * Features:
 * - Drag via header grip area
 * - Resize via bottom-right corner handle
 * - Maximize/restore toggle
 * - Respects viewport bounds
 * - Smooth transitions between states
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { Maximize2, Minimize2, GripHorizontal } from "lucide-react";

interface FloatingPanelProps {
  children: ReactNode;
  /** Initial position from top-left of viewport */
  initialX?: number;
  initialY?: number;
  /** Initial dimensions */
  initialWidth?: number;
  initialHeight?: number;
  /** Min/max constraints */
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Whether to show maximize button */
  showMaximize?: boolean;
  /** CSS class for the outer wrapper */
  className?: string;
  /** z-index for stacking */
  zIndex?: number;
}

export function FloatingPanel({
  children,
  initialX = 280,
  initialY = 60,
  initialWidth = 800,
  initialHeight = 420,
  minWidth = 500,
  minHeight = 300,
  maxWidth,
  maxHeight,
  showMaximize = true,
  className = "",
  zIndex = 1200,
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Panel state
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ w: initialWidth, h: initialHeight });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Refs for drag/resize delta tracking
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0 });
  const preMaxState = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // ── Drag logic ──
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMaximized) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    },
    [pos, isMaximized]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const newX = Math.max(0, Math.min(window.innerWidth - 100, dragStart.current.px + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.py + dy));
      setPos({ x: newX, y: newY });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  // ── Resize logic ──
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMaximized) return;
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
    },
    [size, isMaximized]
  );

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.mx;
      const dy = e.clientY - resizeStart.current.my;
      const mxW = maxWidth || window.innerWidth - pos.x - 16;
      const mxH = maxHeight || window.innerHeight - pos.y - 16;
      const newW = Math.max(minWidth, Math.min(mxW, resizeStart.current.w + dx));
      const newH = Math.max(minHeight, Math.min(mxH, resizeStart.current.h + dy));
      setSize({ w: newW, h: newH });
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing, minWidth, minHeight, maxWidth, maxHeight, pos]);

  // ── Maximize/Restore ──
  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      setPos({ x: preMaxState.current.x, y: preMaxState.current.y });
      setSize({ w: preMaxState.current.w, h: preMaxState.current.h });
      setIsMaximized(false);
    } else {
      preMaxState.current = { x: pos.x, y: pos.y, w: size.w, h: size.h };
      setPos({ x: 16, y: 16 });
      setSize({ w: window.innerWidth - 32, h: window.innerHeight - 32 });
      setIsMaximized(true);
    }
  }, [isMaximized, pos, size]);

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    left: pos.x,
    top: pos.y,
    width: size.w,
    height: size.h,
    zIndex,
    transition: isDragging || isResizing ? "none" : "left 0.25s ease, top 0.25s ease, width 0.25s ease, height 0.25s ease",
  };

  return (
    <div
      ref={panelRef}
      className={`glass-panel rounded-xl flex flex-col overflow-hidden shadow-2xl ${className}`}
      style={panelStyle}
    >
      {/* ── Drag handle bar ── */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b border-border/20 cursor-move select-none shrink-0 hover:bg-black/[0.02] transition-colors"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-1.5 text-muted-foreground/40">
          <GripHorizontal className="w-4 h-4" />
          <span className="text-[9px] uppercase tracking-widest font-medium">
            {isDragging ? "Moving…" : isResizing ? "Resizing…" : "Drag to move"}
          </span>
        </div>
        {showMaximize && (
          <button
            onClick={toggleMaximize}
            className="p-1 rounded hover:bg-black/5 transition-colors text-muted-foreground/50 hover:text-muted-foreground"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {children}
      </div>

      {/* ── Resize handle (bottom-right corner) ── */}
      {!isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize group z-10"
          onMouseDown={onResizeStart}
          title="Drag to resize"
        >
          <svg
            className="absolute bottom-1.5 right-1.5 w-4 h-4 text-muted-foreground/40 group-hover:text-terracotta/70 transition-colors"
            viewBox="0 0 12 12"
          >
            <path d="M11 1v10H1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M11 5v6H5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M11 9v2H9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* ── Resize handle (bottom edge for height) ── */}
      {!isMaximized && (
        <div
          className="absolute bottom-0 left-8 right-8 h-2 cursor-s-resize group z-10"
          onMouseDown={(e) => {
            if (isMaximized) return;
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
            resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
          }}
          title="Drag to resize height"
        >
          <div className="mx-auto mt-1 w-12 h-1 rounded-full bg-muted-foreground/15 group-hover:bg-terracotta/40 transition-colors" />
        </div>
      )}
    </div>
  );
}
