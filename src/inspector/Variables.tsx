import { useId, useRef, useState, type KeyboardEvent } from "react";
import VariableTree from "./variable-tree/VariableTree";
import { useOptionalWatch } from "./watch/WatchProvider";
import type { SugarCubeSnapshot } from "../sugarcube/types";
import type { WatchTarget } from "../sugarcube/watch";

type Tab = "story" | "temporary";

export default function Variables({ snapshot }: { snapshot: SugarCubeSnapshot }) {
  const [activeTab, setActiveTab] = useState<Tab>("story");
  const watch = useOptionalWatch();
  const variables = watch?.variables ?? snapshot.variables;
  const missing = watch?.missingTargets ?? [];
  const id = useId();

  const storyTabRef = useRef<HTMLButtonElement>(null);
  const temporaryTabRef = useRef<HTMLButtonElement>(null);

  const tabs = [
    { value: "story", label: "Story Variables", ref: storyTabRef },
    {
      value: "temporary",
      label: "Temporary Variables",
      ref: temporaryTabRef,
    },
  ] as const;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextTab: Tab;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        nextTab = activeTab === "story" ? "temporary" : "story";
        break;
      case "Home":
        nextTab = "story";
        break;
      case "End":
        nextTab = "temporary";
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveTab(nextTab);

    if (nextTab === "story") {
      storyTabRef.current?.focus();
    } else {
      temporaryTabRef.current?.focus();
    }
  }

  return (
    <div className="text-xs">
      <div
        role="tablist"
        aria-label="Variable scope"
        onKeyDown={handleKeyDown}
        className="flex border-b border-zinc-800"
      >
        {tabs.map(({ value, label, ref }) => {
          const selected = activeTab === value;

          return (
            <button
              key={value}
              ref={ref}
              id={`${id}-${value}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-${value}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(value)}
              className={`border-b-2 px-4 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-zinc-400 ${
                selected
                  ? "border-sky-400 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              } `}
            >
              {label}
            </button>
          );
        })}
      </div>

      <section
        id={`${id}-story-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-story-tab`}
        hidden={activeTab !== "story"}
        className="pt-3"
      >
        <VariableTree scope="story" value={variables.story} />
        <MissingWatches targets={missing.filter((target) => target.scope === "story")} />
      </section>

      <section
        id={`${id}-temporary-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-temporary-tab`}
        hidden={activeTab !== "temporary"}
        className="pt-3"
      >
        <VariableTree scope="temporary" value={variables.temporary} />
        <MissingWatches targets={missing.filter((target) => target.scope === "temporary")} />
      </section>
    </div>
  );
}

function MissingWatches({ targets }: { targets: readonly WatchTarget[] }) {
  if (targets.length === 0) return null;
  return (
    <section aria-label="Missing watched variables" className="mt-3 border-t border-zinc-800 pt-2">
      <p className="mb-1 text-zinc-500">Missing watched variables (read-only)</p>
      {targets.map((target) => {
        const name = (target.scope === "story" ? "$" : "_") +
          target.path.map((part, index) =>
            part.type === "property" ? (index === 0 ? part.key : "." + part.key) :
            part.type === "index" ? "[" + part.index + "]" :
            "[" + part.type + " " + part.index + "]",
          ).join("");
        return <div key={JSON.stringify([target.scope, target.path])}
          className="flex gap-2 px-2 py-1 font-mono text-zinc-500">
          <span className="min-w-0 truncate">{name}</span>
          <span className="ml-auto">Missing</span>
        </div>;
      })}
    </section>
  );
}
