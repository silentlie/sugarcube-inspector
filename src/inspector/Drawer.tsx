import type { ReactNode } from "react";

interface DrawerProps {
  initialWidth: number;
  children: ReactNode;
}

const HANDLE_WIDTH = 8;
const CLOSE_DELAY = 400;

const MIN_WIDTH = 280;
const MAX_WIDTH = 1600;

export default function Drawer({ initialWidth, children }: DrawerProps) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(initialWidth);

  const closeTimerRef = useRef<number | null>(null);
  const resizePointerIdRef = useRef<number | null>(null);

  const resizeStartRef = useRef({
    x: 0,
    width: initialWidth,
  });

  function cancelClose() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function handleEnter() {
    cancelClose();
    setOpen(true);
  }

  function handleLeave() {
    if (resizePointerIdRef.current !== null) return;

    cancelClose();

    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY);
  }

  function handleResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    event.preventDefault();
    cancelClose();

    setOpen(true);

    resizePointerIdRef.current = event.pointerId;

    resizeStartRef.current = {
      x: event.clientX,
      width,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (resizePointerIdRef.current !== event.pointerId) return;

    const delta = resizeStartRef.current.x - event.clientX;

    const maxWidth = Math.min(MAX_WIDTH, window.innerWidth);

    const nextWidth = Math.min(
      maxWidth,
      Math.max(
        Math.min(MIN_WIDTH, maxWidth),
        resizeStartRef.current.width + delta,
      ),
    );

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

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    setOpen(true);

    const delta = event.key === "ArrowLeft" ? 24 : -24;
    const maxWidth = Math.min(MAX_WIDTH, window.innerWidth);

    setWidth((current) =>
      Math.min(
        maxWidth,
        Math.max(Math.min(MIN_WIDTH, maxWidth), current + delta),
      ),
    );
  }

  useEffect(() => {
    return () => {
      cancelClose();
    };
  }, []);

  return (
    <aside
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        width,
        maxWidth: "100vw",
        transform: open
          ? "translateX(0)"
          : `translateX(calc(100% - ${HANDLE_WIDTH}px))`,
      }}
      className="fixed top-0 right-0 h-screen bg-zinc-950 font-sans text-zinc-100 shadow-2xl transition-transform duration-150"
    >
      <button
        type="button"
        aria-label="Resize SugarCube Inspector"
        aria-expanded={open}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResize}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onLostPointerCapture={() => {
          resizePointerIdRef.current = null;
        }}
        onKeyDown={handleKeyDown}
        style={{
          width: HANDLE_WIDTH,
          touchAction: "none",
        }}
        className="absolute top-0 left-0 h-full cursor-ew-resize border-0 bg-zinc-500/40 p-0 hover:bg-zinc-400/70 focus:ring-2 focus:ring-zinc-300 focus:outline-none focus:ring-inset"
      />

      <div
        style={{ marginLeft: HANDLE_WIDTH }}
        className="h-full scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent overflow-y-auto p-5 hover:scrollbar-thumb-zinc-600"
      >
        {children}
      </div>
    </aside>
  );
}
