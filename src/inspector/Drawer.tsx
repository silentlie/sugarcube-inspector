import { useEffect, useRef, useState } from "react";
import { ObjectInspector } from "react-inspector";
import { deserializeValue } from "../sugarcube/serialize";
import type { SugarCubeSnapshot } from "../sugarcube/types";

interface DrawerProps {
  initialWidth: number;
  storyName: string;
  snapshot: SugarCubeSnapshot | null;
  onRefresh: () => void;
}

const HANDLE_WIDTH = 8;
const CLOSE_DELAY = 400;

const MIN_WIDTH = 280;
const MAX_WIDTH = 1600;

export default function Drawer({
  initialWidth,
  storyName,
  snapshot,
  onRefresh,
}: DrawerProps) {
  const variables = useMemo(() => {
    if (!snapshot) return null;

    try {
      return {
        story: deserializeValue(snapshot.variables.story),
        temporary: deserializeValue(snapshot.variables.temporary),
      };
    } catch (error) {
      console.error("[SugarCube Inspector]", error);
      return null;
    }
  }, [snapshot]);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);

  const closeTimer = useRef<number | null>(null);

  const resizeStart = useRef({
    x: 0,
    width: initialWidth,
  });

  function cancelClose() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function handleEnter() {
    cancelClose();
    setOpen(true);
  }

  function handleLeave() {
    if (resizing) return;

    cancelClose();

    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, CLOSE_DELAY);
  }

  function handleResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();

    cancelClose();
    setOpen(true);
    setResizing(true);

    resizeStart.current = {
      x: event.clientX,
      width,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (!resizing) return;

    const delta = resizeStart.current.x - event.clientX;

    const nextWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, resizeStart.current.width + delta),
    );

    setWidth(nextWidth);
  }

  function handleResizeEnd(event: React.PointerEvent<HTMLButtonElement>) {
    if (!resizing) return;

    setResizing(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
        transform: open
          ? "translateX(0)"
          : `translateX(calc(100% - ${HANDLE_WIDTH}px))`,
      }}
      className="
        fixed right-0 top-0
        h-screen
        font-sans
        bg-zinc-950 text-zinc-100
        shadow-2xl
        transition-transform duration-150
      "
    >
      <button
        type="button"
        aria-label="Resize SugarCube Inspector"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResize}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        style={{
          width: HANDLE_WIDTH,
          touchAction: "none",
        }}
        className="
          absolute left-0 top-0
          h-full
          cursor-ew-resize
          border-0
          bg-zinc-500/40
          p-0
          hover:bg-zinc-400/70
          focus:outline-none
          focus:ring-2
          focus:ring-inset
          focus:ring-zinc-300
        "
      />

      <div
        style={{ marginLeft: HANDLE_WIDTH }}
        className="h-full overflow-y-auto p-5"
      >
        <h1 className="text-lg font-semibold">SugarCube Inspector</h1>

        <p className="mt-1 text-sm text-zinc-400">{storyName}</p>

        <hr className="my-4 border-zinc-800" />

        <button
          type="button"
          onClick={onRefresh}
          className="rounded bg-zinc-800 px-3 py-1 text-sm"
        >
          Refresh
        </button>

        {variables && (
          <div className="mt-4 space-y-5 text-xs">
            <section>
              <h2 className="mb-2 text-sm font-medium">Story Variables</h2>

              <ObjectInspector
                name="$"
                data={variables.story}
                theme="chromeDark"
                expandLevel={1}
              />
            </section>

            <section>
              <h2 className="mb-2 text-sm font-medium">Temporary Variables</h2>

              <ObjectInspector
                name="_"
                data={variables.temporary}
                theme="chromeDark"
                expandLevel={1}
              />
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
