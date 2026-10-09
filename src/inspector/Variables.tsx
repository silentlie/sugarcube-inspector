import { useId, useRef, useState, type KeyboardEvent } from "react";
import VariableTree from "./variable-tree/VariableTree";
import { useWatch } from "./watch/WatchProvider";

type Tab = "story" | "temporary";

export default function Variables() {
  const [activeTab, setActiveTab] = useState<Tab>("story");
  const { variables } = useWatch();
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
      </section>

      <section
        id={`${id}-temporary-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-temporary-tab`}
        hidden={activeTab !== "temporary"}
        className="pt-3"
      >
        <VariableTree scope="temporary" value={variables.temporary} />
      </section>
    </div>
  );
}
