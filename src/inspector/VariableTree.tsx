import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { useInView } from "react-intersection-observer";
import { isReference, type Scope } from "../inspection/direct";
import type { VariableSlot } from "../inspection/variableSlots";
import { useVariable } from "./useVariableWatch";
import { VariableChildren } from "./VariableTile";

export default function VariableTree({ scope }: { scope: Scope }) {
  const { ref, inView: visible } = useInView();
  const slot = useMemo<VariableSlot>(() => ({ kind: "root", scope }), [scope]);
  const root = useVariable(slot, visible);

  return (
    <Box ref={ref}>
      {!root.exists ? (
        <Typography variant="body2" color="text.secondary">Waiting for SugarCube...</Typography>
      ) : root.error ? (
        <Typography role="alert" variant="body2" color="error">{root.error}</Typography>
      ) : isReference(root.value) ? (
        <VariableChildren value={root.value} ancestors={[]} />
      ) : (
        <Typography variant="body2" color="text.secondary">{root.preview}</Typography>
      )}
    </Box>
  );
}
