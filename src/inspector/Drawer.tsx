import { theme } from "antd";
import { ChevronLeft, ChevronRight, MousePointer2, Pin } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface DrawerProps {
  initialWidth: number;
  children: ReactNode;
}

type DrawerMode = "hover" | "click";

const HANDLE_WIDTH = 8;
const CLOSE_DELAY = 400;
const MIN_WIDTH = 280;
const MAX_WIDTH = 1600;

/** Retain the custom hover/resize drawer; Ant's modal Drawer is not a substitute. */
export default function Drawer({ initialWidth, children }: DrawerProps) {
  const { token } = theme.useToken();
  const [mode, setMode] = useState<DrawerMode>("hover");
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(initialWidth);
  const closeTimerRef = useRef<number | null>(null);
  const resizePointerIdRef = useRef<number | null>(null);
  const resizeStartRef = useRef({ x: 0, width: initialWidth });

  function cancelClose() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function handleEnter() {
    if (mode !== "hover") return;
    cancelClose();
    setOpen(true);
  }

  function handleLeave() {
    if (mode !== "hover" || resizePointerIdRef.current !== null) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY);
  }

  function switchMode() {
    cancelClose();
    setMode((current) => current === "hover" ? "click" : "hover");
  }

  function handleResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    cancelClose();
    setOpen(true);
    resizePointerIdRef.current = event.pointerId;
    resizeStartRef.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (resizePointerIdRef.current !== event.pointerId) return;
    const delta = resizeStartRef.current.x - event.clientX;
    const maxWidth = Math.min(MAX_WIDTH, window.innerWidth);
    const nextWidth = Math.min(maxWidth,
      Math.max(Math.min(MIN_WIDTH, maxWidth), resizeStartRef.current.width + delta));
    setWidth(nextWidth);
  }

  function handleResizeEnd(event: React.PointerEvent<HTMLButtonElement>) {
    if (resizePointerIdRef.current !== event.pointerId) return;
    resizePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setOpen(true);
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    const maxWidth = Math.min(MAX_WIDTH, window.innerWidth);
    setWidth((current) =>
      Math.min(maxWidth, Math.max(Math.min(MIN_WIDTH, maxWidth), current + delta)));
  }

  useEffect(() => () => cancelClose(), []);

  return (
    <aside className="fixed top-0 right-0 h-screen max-w-[100vw] transition-transform duration-150"
      onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      style={{
        width, background: token.colorBgElevated,
        color: token.colorText, boxShadow: token.boxShadowSecondary,
        fontFamily: token.fontFamily, fontSize: token.fontSize,
        transform: open ? "translateX(0)" :
          mode === "hover" ? `translateX(calc(100% - ${HANDLE_WIDTH}px))` : "translateX(100%)",
      }}>
      {mode === "click" && (
        <button type="button"
          className="absolute top-16 -left-8 flex h-10 w-8 cursor-pointer items-center justify-center border p-0"
          aria-label={open ? "Close SugarCube Inspector" : "Open SugarCube Inspector"}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          style={{
            color: token.colorText,
            background: token.colorBgElevated,
            borderColor: token.colorBorder,
            borderRight: 0,
            borderRadius: "8px 0 0 8px",
          }}>
          {open ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      )}
      <button type="button"
        className="absolute top-3 right-3 z-10 flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0"
        aria-label={mode === "hover" ? "Switch to click-to-toggle mode" : "Switch to hover mode"}
        aria-pressed={mode === "click"}
        title={mode === "hover" ? "Switch to click-to-toggle mode" : "Switch to hover mode"}
        onClick={switchMode}
        style={{ color: token.colorTextSecondary }}>
        {mode === "hover" ? <Pin size={16} /> : <MousePointer2 size={16} />}
      </button>
      <button type="button" className="absolute top-0 left-0 h-full cursor-ew-resize touch-none border-0 p-0" aria-label="Resize SugarCube Inspector"
        aria-expanded={open} onPointerDown={handleResizeStart}
        onPointerMove={handleResize} onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onLostPointerCapture={() => { resizePointerIdRef.current = null; }}
        onKeyDown={handleKeyDown}
        style={{ width: HANDLE_WIDTH, background: token.colorFillSecondary }}
      />
      <div className="flex h-full min-h-0 flex-col overflow-hidden p-4"
        style={{ marginLeft: HANDLE_WIDTH }}>
        {children}
      </div>
    </aside>
  );
}
