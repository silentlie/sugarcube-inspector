import { ChevronDown, ChevronRight } from "lucide-react";
import ValuePreview from "./ValuePreview";
import { getValueType } from "./valueUtils";

interface VariableTileProps {
  name: string;
  value: unknown;
  circular: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
}

export default function VariableTile({
  name,
  value,
  circular,
  expandable,
  expanded,
  onToggle,
}: VariableTileProps) {
  const content = (
    <>
      {expandable &&
        (expanded ? (
          <ChevronDown size={16} aria-hidden="true" />
        ) : (
          <ChevronRight size={16} aria-hidden="true" />
        ))}

      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate font-medium text-zinc-200">
          {name}
        </span>

        <span className="shrink-0 text-[10px] text-zinc-500">
          {getValueType(value)}
        </span>
      </span>

      <span className="ml-auto min-w-0 truncate font-mono">
        {circular ? (
          <span className="text-zinc-500">[Circular]</span>
        ) : (
          <ValuePreview value={value} />
        )}
      </span>
    </>
  );

  const className = `
    flex w-full min-w-0 items-center gap-2
    rounded px-2 py-1.5 text-left text-xs
    hover:bg-zinc-800
  `;

  if (expandable) {
    return (
      <button
        type="button"
        aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
        aria-expanded={expanded}
        onClick={onToggle}
        className={`
          ${className}
          cursor-pointer
          focus-visible:outline-2
          focus-visible:outline-zinc-400
        `}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
