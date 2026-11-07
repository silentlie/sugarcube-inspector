import { Select } from "antd";
import { type ComponentRef, useEffect, useRef, useState } from "react";

type PassageOption = { label: string; value: string; tags: string; source: string };

function sourceMatch(source: string, query: string) {
  const text = query.trim();
  return text ? new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu").exec(source) : null;
}

function readPassages(): PassageOption[] {
  return [...document.querySelectorAll('tw-storydata[format="SugarCube"] > tw-passagedata[name]')]
    .map((element) => {
      const name = element.getAttribute("name") ?? "";
      return { label: name, value: name, tags: element.getAttribute("tags") ?? "", source: element.textContent ?? "" };
    });
}

export default function StoryPassages({ selected, onSelect, focusRequest, initialQuery = "" }: {
  selected?: string;
  onSelect: (name: string) => void;
  focusRequest: number;
  initialQuery?: string;
}) {
  const [passages] = useState(readPassages);
  const [query, setQuery] = useState(initialQuery);
  const pickerRef = useRef<ComponentRef<typeof Select>>(null);
  const passage = passages.find(({ value }) => value === selected);

  useEffect(() => {
    if (focusRequest <= 0) return;
    // Ant resets search during mount; seed the requested query after tab layout.
    const frame = requestAnimationFrame(() => {
      setQuery(initialQuery);
      pickerRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, initialQuery]);

  return <section aria-label="Passage browser" className="flex min-h-0 flex-1 flex-col gap-2 px-1 py-2">
    <Select<string, PassageOption> ref={pickerRef} aria-label="Find passage" className="w-full min-w-0"
      defaultOpen={Boolean(initialQuery)} placeholder="Search passage titles, tags, or source" value={selected} options={passages}
      onChange={onSelect} onSelect={() => setQuery("")} onBlur={() => setQuery("")}
      getPopupContainer={(trigger) => trigger.closest("aside") ?? trigger}
      showSearch={{ searchValue: query, onSearch: setQuery, filterOption: (input, option) => {
        const query = input.trim().toLowerCase();
        return !!option && (option.label.toLowerCase().includes(query) || option.tags.toLowerCase().includes(query) ||
          !!sourceMatch(option.source, input));
      } }} optionRender={({ data }) => {
        const match = sourceMatch(data.source, query);
        const excerpt = !match ? "" : data.source.slice(Math.max(0, match.index - 24), match.index + match[0].length + 60).replace(/\s+/g, " ");
        return <span className="block truncate" title={excerpt || data.label}>
          <span>{data.label}</span>{excerpt && <span className="text-xs opacity-70"> · {excerpt}</span>}
        </span>;
      }} />
    {passage ? <>
      <h3 className="font-semibold wrap-anywhere">{passage.label}</h3>
      {passage.tags && <p className="text-xs wrap-anywhere">Tags · {passage.tags}</p>}
      <pre key={passage.value} aria-label="Passage source"
        className="min-h-0 flex-1 overflow-auto rounded border border-current p-2 text-xs wrap-anywhere whitespace-pre-wrap">
        {passage.source}
      </pre>
    </> : <p>{selected ? "This passage has no source in the export." : "Choose a passage to view its source."}</p>}
  </section>;
}
