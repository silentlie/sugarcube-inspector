import { ChevronDown, ChevronRight, Star } from "lucide-react";
import ValuePreview from "./ValuePreview";
import { getValueType } from "./valueTypes";

interface VariableTileProps {
  name: string;
  value: unknown;
  circular: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  circularTarget?: string;
  onNavigateCircular?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

export default function VariableTile({
  name,
  value,
  circular,
  expandable,
  expanded,
  onToggle,
  circularTarget,
  onNavigateCircular,
  favorite = false,
  onToggleFavorite,
}: VariableTileProps) {
  const content = (
    <>
      {expandable && (expanded ? (
        <ChevronDown size={16} aria-hidden="true" />
      ) : (
        <ChevronRight size={16} aria-hidden="true" />
      ))}

      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate font-medium text-zinc-200">{name}</span>
        <span className="shrink-0 text-[10px] text-zinc-500">{getValueType(value)}</span>
      </span>

      <span className="ml-auto min-w-0 truncate font-mono">
        {circular ? (
          <button
            type="button"
            aria-label={`Go to ${circularTarget ?? "circular ancestor"}`}
            title={`Navigate to ${circularTarget ?? "ancestor"}`}
            onClick={onNavigateCircular}
            className="cursor-pointer rounded text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            ↗ {circularTarget ?? "[Circular]"}
          </button>
        ) : (
          <ValuePreview value={value} />
        )}
      </span>
    </>
  );

  const tileClassName =
    "flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs";

  return (
    <div className="group flex min-w-0 items-center rounded hover:bg-zinc-800">
      {expandable ? (
        <button
          type="button"
          aria-label={(expanded ? "Collapse " : "Expand ") + name}
          aria-expanded={expanded}
          onClick={onToggle}
          className={tileClassName + " cursor-pointer focus-visible:outline-2 focus-visible:outline-zinc-400"}
        >
          {content}
        </button>
      ) : (
        <div className={tileClassName}>{content}</div>
      )}

      {onToggleFavorite && (
        <button
          type="button"
          aria-label={(favorite ? "Unfavorite " : "Favorite ") + name}
          title={favorite ? "Remove favorite" : "Favorite variable"}
          onClick={(event) => {
            // A second click in a double-click should not undo the first.
            if (event.detail < 2) onToggleFavorite();
          }}
          className={"shrink-0 rounded p-1 focus-visible:outline-2 focus-visible:outline-zinc-400 " +
            (favorite
              ? "text-amber-400"
              : "text-zinc-600 opacity-0 hover:text-zinc-300 focus-visible:opacity-100 group-hover:opacity-100")}
        >
          <Star size={14} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
