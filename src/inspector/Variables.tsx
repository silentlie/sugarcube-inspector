import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import VariableTree from "./variable-tree/VariableTree";
import { useWatch } from "./watch/WatchProvider";
import { watchKey, watchPathExists, type WatchTarget } from "../sugarcube/watch";
import { useAnyVariableVersion } from "./watch/VariableStore";

type Tab = "story" | "temporary";

export default function Variables() {
  const [activeTab, setActiveTab] = useState<Tab>("story");
  const watch = useWatch();
  const setVisible = watch.setVisible;
  // Watch the active scope's root structure on every poll, even when empty,
  // offscreen, or composed entirely of collapsed containers.
  useEffect(() => {
    const root: WatchTarget = { path: [activeTab] };
    setVisible(root, true);
    return () => setVisible(root, false);
  }, [activeTab, setVisible]);

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
        <VariableTree scope="story" />
        <MissingWatches scope="story" />
      </section>

      <section
        id={`${id}-temporary-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-temporary-tab`}
        hidden={activeTab !== "temporary"}
        className="pt-3"
      >
        <VariableTree scope="temporary" />
        <MissingWatches scope="temporary" />
      </section>
    </div>
  );
}

function MissingWatches({ scope }: { scope: Tab }) {
  const watch = useWatch();
  useAnyVariableVersion(watch.store);
  const targets = watch.watchedTargets.filter((target) =>
    target.path[0] === scope && !watchPathExists(watch.variables, target),
  );
  if (targets.length === 0) return null;
  return (
    <section aria-label="Missing watched variables" className="mt-3 border-t border-zinc-800 pt-2">
      <p className="mb-1 text-zinc-500">Missing watched variables (read-only)</p>
      {targets.map((target) => {
        const [, ...segments] = target.path;
        const name = (target.path[0] === "story" ? "$" : "_") +
          segments.map((part, index) =>
            part.type === "property" ? (index === 0 ? part.key : "." + part.key) :
            part.type === "index" ? "[" + part.index + "]" :
            "[" + part.type + " " + part.index + "]",
          ).join("");
        return <div key={watchKey(target)}
          className="flex gap-2 px-2 py-1 font-mono text-zinc-500">
          <span className="min-w-0 truncate">{name}</span>
          <span className="ml-auto">Missing</span>
          <button
            type="button"
            aria-label={`Unfavorite ${name}`}
            title="Remove favorite"
            onClick={() => watch.toggleFavorite(target, false)}
            className="shrink-0 rounded p-1 text-amber-400 focus-visible:outline-2 focus-visible:outline-zinc-400"
          >
            <Star size={14} fill="currentColor" aria-hidden="true" />
          </button>
        </div>;
      })}
    </section>
  );
}
