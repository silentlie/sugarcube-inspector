import { theme } from "antd";
import { ChevronLeft, ChevronRight, MousePointer2, Pin } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface DrawerProps {
  initialWidth: number;
  children: ReactNode;
}

type DrawerMode = "hover" | "click";

const HANDLE_WIDTH = 8;
const TAB_WIDTH = 32;
const CLOSE_DELAY = 400;
const TAB_HEIGHT = 40;
const TAB_START_TOP = 64;
const TAB_DRAG_THRESHOLD = 5;
const TAB_KEYBOARD_STEP = 24;

/** Leave room for the fixed click-mode tab; CSS still enforces min-content. */
function clampWidth(width: number, mode: DrawerMode): number {
  const tabClearance = mode === "click" ? TAB_WIDTH : 0;
  return Math.min(Math.max(0, window.innerWidth - tabClearance), Math.max(0, width));
}

function clampTabTop(top: number) {
  return Math.min(Math.max(0, top), Math.max(0, window.innerHeight - TAB_HEIGHT));
}

/** Retain the custom hover/resize drawer; Ant's modal Drawer is not a substitute. */
export default function Drawer({ initialWidth, children }: DrawerProps) {
  const { token } = theme.useToken();
  const [mode, setMode] = useState<DrawerMode>("hover");
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(initialWidth);
  const drawerRef = useRef<HTMLElement>(null);
  const [tabTop, setTabTop] = useState(TAB_START_TOP);
  const tabDragRef = useRef<{ pointerId: number; startY: number; startTop: number; moved: boolean } | null>(null);
  const suppressTabClickRef = useRef(false);
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

  function handleTabPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    suppressTabClickRef.current = false;
    tabDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: clampTabTop(tabTop),
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTabPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = tabDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(delta) < TAB_DRAG_THRESHOLD) return;
    drag.moved = true;
    setTabTop(clampTabTop(drag.startTop + delta));
  }

  function handleTabPointerEnd(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = tabDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressTabClickRef.current = drag.moved && event.type === "pointerup";
    tabDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleTabClick() {
    if (suppressTabClickRef.current) {
      suppressTabClickRef.current = false;
      return;
    }
    setOpen((current) => !current);
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    suppressTabClickRef.current = false;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    setTabTop((current) => clampTabTop(
      current + (event.key === "ArrowDown" ? TAB_KEYBOARD_STEP : -TAB_KEYBOARD_STEP),
    ));
  }

  function handleResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    cancelClose();
    setOpen(true);
    resizePointerIdRef.current = event.pointerId;
    const drawer = drawerRef.current;
    resizeStartRef.current = {
      x: event.clientX,
      width: drawer?.getBoundingClientRect().width || width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (resizePointerIdRef.current !== event.pointerId) return;
    const delta = resizeStartRef.current.x - event.clientX;
    setWidth(clampWidth(resizeStartRef.current.width + delta, mode));
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
    const drawer = drawerRef.current;
    const currentWidth = drawer?.getBoundingClientRect().width || width;
    setWidth(clampWidth(currentWidth + delta, mode));
  }

  useEffect(() => () => cancelClose(), []);

  return (
    <aside ref={drawerRef} className="fixed top-0 right-0 h-screen transition-transform duration-150"
      onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      style={{
        width, minWidth: "min-content",
        maxWidth: mode === "click" ? `max(0px, calc(100vw - ${TAB_WIDTH}px))` : "100vw",
        background: token.colorBgElevated,
        color: token.colorText, boxShadow: token.boxShadowSecondary,
        fontFamily: token.fontFamily, fontSize: token.fontSize,
        transform: open ? "translateX(0)" :
          mode === "hover" ? `translateX(calc(100% - ${HANDLE_WIDTH}px))` : "translateX(100%)",
      }}>
      {mode === "click" && (
        <button type="button"
          className="absolute flex cursor-ns-resize touch-none items-center justify-center border p-0"
          aria-label={open ? "Close SugarCube Inspector" : "Open SugarCube Inspector"}
          aria-expanded={open}
          title="Click to toggle; drag up or down to reposition"
          onClick={handleTabClick}
          onPointerDown={handleTabPointerDown}
          onPointerMove={handleTabPointerMove}
          onPointerUp={handleTabPointerEnd}
          onPointerCancel={handleTabPointerEnd}
          onLostPointerCapture={() => { tabDragRef.current = null; }}
          onKeyDown={handleTabKeyDown}
          style={{
            // Fixed pixel dimensions match the viewport clamp, regardless of host rem sizing.
            width: TAB_WIDTH,
            height: TAB_HEIGHT,
            // Protrude at normal widths; shift only if min-content forces overflow.
            left: open ? `max(-${TAB_WIDTH}px, calc(100% - 100vw))` : `-${TAB_WIDTH}px`,
            top: `clamp(0px, ${tabTop}px, calc(100vh - ${TAB_HEIGHT}px))`,
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
        inert={!open}
        title={mode === "hover" ? "Switch to click-to-toggle mode" : "Switch to hover mode"}
        onClick={switchMode}
        style={{ color: token.colorTextSecondary }}>
        {mode === "hover" ? <Pin size={16} /> : <MousePointer2 size={16} />}
      </button>
      <button type="button" className="absolute top-0 left-0 h-full cursor-ew-resize touch-none border-0 p-0" aria-label="Resize SugarCube Inspector"
        aria-expanded={open} inert={!open && mode === "click"} onPointerDown={handleResizeStart}
        onPointerMove={handleResize} onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onLostPointerCapture={() => { resizePointerIdRef.current = null; }}
        onKeyDown={handleKeyDown}
        style={{ width: HANDLE_WIDTH, background: token.colorFillSecondary }}
      />
      <div className="flex h-full min-h-0 flex-col overflow-hidden px-3 py-2"
        inert={!open}
        style={{ marginLeft: HANDLE_WIDTH }}>
        {children}
      </div>
    </aside>
  );
}
