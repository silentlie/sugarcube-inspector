import { useMemo } from "react";
import { isReference, type Scope } from "../inspection/direct";
import type { VariableSlot } from "../inspection/variableSlots";
import { VariableChildren } from "./VariableTile";
import { useInView } from "react-intersection-observer";
import { useVariable } from "./useVariableWatch";

export default function VariableTree({ scope }: { scope: Scope }) {
  const { ref, inView: visible } = useInView();
  const slot = useMemo<VariableSlot>(() => ({ kind: "root", scope }), [scope]);
  const root = useVariable(slot, visible);

  return (
    <div ref={ref}>
      {!root.exists ? (
        <p className="p-2 text-xs text-zinc-500">Waiting for SugarCube...</p>
      ) : root.error ? (
        <p role="alert" className="p-2 text-xs text-red-400">{root.error}</p>
      ) : isReference(root.value) ? (
        <VariableChildren value={root.value} ancestors={[]} />
      ) : (
        <p className="p-2 text-xs text-zinc-500">{root.preview}</p>
      )}
    </div>
  );
}

