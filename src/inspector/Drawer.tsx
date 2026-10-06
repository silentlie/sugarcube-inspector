import { useRef, useState } from "react";

interface DrawerProps {
  width: number;
  storyName: string;
  onOpenChange: (open: boolean) => void;
}

const HANDLE_WIDTH = 8;
const CLOSE_DELAY = 400;

export default function Drawer({
  width,
  storyName,
  onOpenChange,
}: DrawerProps) {
  const [open, setOpen] = useState(false);

  const closeTimer = useRef<number | null>(null);

  function setDrawerOpen(value: boolean) {
    setOpen(value);
    onOpenChange(value);
  }

  function handleEnter() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }

    setDrawerOpen(true);
  }

  function handleLeave() {
    closeTimer.current = window.setTimeout(() => {
      setDrawerOpen(false);
    }, CLOSE_DELAY);
  }

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
      <div
        style={{ width: HANDLE_WIDTH }}
        className="
          absolute left-0 top-0
          h-full
          cursor-pointer
          bg-zinc-500/40
          hover:bg-zinc-400/70
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
