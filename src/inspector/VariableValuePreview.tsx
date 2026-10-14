import { useMemo } from "react";
import type { VariableLocation, VariableSnapshot } from "../inspection/variableLocation";
import { useVariable } from "./useVariableWatch";
import { TypeSyntax, ValueSyntax } from "./valueSyntax";

/** Render a live value snapshot as syntax-highlighted type and preview tokens. */
export function VariableValuePreview({ current, showType = true }: { current: VariableSnapshot; showType?: boolean }) {
  const type = current.kind === "value" ? current.type :
    current.kind === "accessor" ? current.accessor : current.kind;
  const preview = current.kind === "value" ? current.preview :
    current.kind === "accessor" ? `[${current.accessor}]` : "[Missing]";
  return <>
    {showType && <span className="shrink-0 whitespace-nowrap font-mono text-[12px]">
      <TypeSyntax type={type} />
    </span>}
    <span title={preview} className={`overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] ${showType ? "max-w-[45%]" : "max-w-full"}`}>
      <ValueSyntax type={type} preview={preview} />
    </span>
  </>;
}

export function MapKeyPreview({ location }: {
  location: Extract<VariableLocation, {kind:"map"}>;
}) {
  const keyLocation = useMemo(() => ({ ...location, part: "key" as const }), [location]);
  const key = useVariable(keyLocation);
  return <VariableValuePreview current={key} showType={false} />;
}

