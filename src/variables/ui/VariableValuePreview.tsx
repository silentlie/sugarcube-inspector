import { useMemo } from "react";
import type { VariableLocation, VariableSnapshot } from "../location";
import { useVariable } from "./useVariableWatch";
import { TypeSyntax, ValueSyntax } from "./valueSyntax";

function snapshotType(current: VariableSnapshot): string {
  return current.kind === "value" ? current.type :
    current.kind === "accessor" ? current.accessor : current.kind;
}

function snapshotPreview(current: VariableSnapshot): string {
  return current.kind === "value" ? current.preview :
    current.kind === "accessor" ? `[${current.accessor}]` : "[Missing]";
}

/** Keep the type beside the key while displaying the value at the row's right edge. */
export function VariableTypePreview({ current }: { current: VariableSnapshot }) {
  return <TypeSyntax type={snapshotType(current)} />;
}

/** Syntax-highlight only the value; the type appears beside the key. */
export function VariableValuePreview({ current }: { current: VariableSnapshot }) {
  const type = snapshotType(current);
  const preview = snapshotPreview(current);
  return (
    <span title={preview} className="ml-auto min-w-0 max-w-[45%] truncate text-right font-mono text-[12px]">
      <ValueSyntax type={type} preview={preview} />
    </span>
  );
}

export function MapKeyPreview({ location }: {
  location: Extract<VariableLocation, {kind:"map"}>;
}) {
  const keyLocation = useMemo(() => ({ ...location, part: "key" as const }), [location]);
  const key = useVariable(keyLocation);
  const preview = snapshotPreview(key);
  return <span title={preview} className="block min-w-0 truncate font-mono text-[12px]">
    <ValueSyntax type={snapshotType(key)} preview={preview} />
  </span>;
}
