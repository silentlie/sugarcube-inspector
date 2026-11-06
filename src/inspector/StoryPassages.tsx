import { Select } from "antd";
import { type ComponentRef, useEffect, useRef, useState } from "react";

type PassageOption = { label: string; value: string; tags: string; element: Element };

function readPassages(): PassageOption[] {
  return [...document.querySelectorAll('tw-storydata[format="SugarCube"] > tw-passagedata[name]')]
    .map((element) => {
      const name = element.getAttribute("name") ?? "";
      return { label: name, value: name, tags: element.getAttribute("tags") ?? "", element };
    });
}

export default function StoryPassages({ selected, onSelect, focusRequest }: {
  selected?: string;
  onSelect: (name: string) => void;
  focusRequest: number;
}) {
  const [passages] = useState(readPassages);
  const pickerRef = useRef<ComponentRef<typeof Select>>(null);
  const passage = passages.find(({ value }) => value === selected);

  useEffect(() => {
    if (focusRequest > 0) pickerRef.current?.focus();
  }, [focusRequest]);

  return <section aria-label="Passage browser" className="flex min-h-0 flex-1 flex-col gap-2 px-1 py-2">
    <Select<string, PassageOption> ref={pickerRef} aria-label="Find passage" className="w-full min-w-0"
      placeholder="Search passage titles or tags" value={selected} options={passages} onChange={onSelect}
      getPopupContainer={(trigger) => trigger.closest("aside") ?? trigger}
      showSearch={{ filterOption: (input, option) => {
        const query = input.trim().toLowerCase();
        return !!option && (option.label.toLowerCase().includes(query) || option.tags.toLowerCase().includes(query));
      } }} />
    {passage ? <>
      <h3 className="font-semibold wrap-anywhere">{passage.label}</h3>
      {passage.tags && <p className="text-xs wrap-anywhere">Tags · {passage.tags}</p>}
      <pre key={passage.value} aria-label="Passage source"
        className="min-h-0 flex-1 overflow-auto rounded border border-current p-2 text-xs wrap-anywhere whitespace-pre-wrap">
        {passage.element.textContent}
      </pre>
    </> : <p>{selected ? "This passage has no source in the export." : "Choose a passage to view its source."}</p>}
  </section>;
}
