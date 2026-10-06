import { useEffect, useRef, useState } from "react";

interface DrawerProps {
  width: number;
  storyName: string;
}

const HANDLE_WIDTH = 8;
const CLOSE_DELAY = 400;

export default function Drawer({ width, storyName }: DrawerProps) {
  const [open, setOpen] = useState(false);

  const closeTimer = useRef<number | null>(null);

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
    cancelClose();

    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, CLOSE_DELAY);
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
        bg-zinc-950 text-zinc-100
        shadow-2xl
        transition-transform duration-150
      "
    >
      <button
        type="button"
        aria-label={
          open ? "Close SugarCube Inspector" : "Open SugarCube Inspector"
        }
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{ width: HANDLE_WIDTH }}
        className="
          absolute left-0 top-0
          h-full
          cursor-pointer
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

        <p className="text-sm">Drawer is working.</p>
      </div>
    </aside>
  );
}
