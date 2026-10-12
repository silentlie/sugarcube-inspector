import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import type { VariableSlot } from "../inspection/variableSlots";
import { listChildren } from "../inspection/variableStructure";
import { useStructure, useVariable } from "./useVariableWatch";

const PAGE_SIZE = 100;

/** Each row subscribes to its live location, including object replacements. */
function VariableTile({
  slot, name, ancestors,
}: {
  slot: VariableSlot;
  name: string;
  ancestors: readonly object[];
}) {
  const { ref, inView: visible } = useInView();
  const current = useVariable(slot, visible);
  const [expanded, setExpanded] = useState(false);
  const circular = current.expandable && ancestors.includes(current.value as object);
  const canExpand = current.expandable && !circular;

  return (
    <Box ref={ref}>
      <ListItem component="div" data-variable-row dense disableGutters>
        {canExpand ? (
          <IconButton size="small" aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
            aria-expanded={expanded} onClick={() => setExpanded((old) => !old)}>
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </IconButton>
        ) : (
          <Box aria-hidden="true" sx={{ width: 34, flexShrink: 0 }} />
        )}
        <ListItemText primary={name} slotProps={{ primary: { noWrap: true } }}
          sx={{ minWidth: 0 }} />
        <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary" noWrap
            title={current.preview} sx={{ fontFamily: "monospace", maxWidth: 150 }}>
            {current.preview}
          </Typography>
          {circular && <Typography variant="caption" color="info.main">same reference</Typography>}
          {current.hidden && <Typography variant="caption" color="text.disabled">hidden</Typography>}
        </Stack>
      </ListItem>
      {current.error && (
        <Typography role="alert" variant="caption" color="error">{current.error}</Typography>
      )}
      <Collapse in={expanded && canExpand} unmountOnExit>
        <Box sx={{ pl: 2 }}>
          {canExpand && <VariableChildren value={current.value as object} ancestors={ancestors} />}
        </Box>
      </Collapse>
    </Box>
  );
}

/** Watches structure only in expanded containers, and pages child rows. */
export function VariableChildren({
  value, ancestors,
}: {
  value: object;
  ancestors: readonly object[];
}) {
  const { ref, inView: visible } = useInView();
  const structure = useStructure(value, visible);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const lineage = useMemo(() => [...ancestors, value], [ancestors, value]);
  const children = useMemo(() => {
    if (structure.error) return [];
    try {
      return listChildren(value);
    } catch {
      return [];
    }
  }, [value, structure]);

  return (
    <List component="div" disablePadding dense ref={ref}>
      {structure.error ? (
        <Typography role="alert" variant="caption" color="error">{structure.error}</Typography>
      ) : children.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No properties</Typography>
      ) : (
        <>
          {children.slice(0, limit).map((child) => (
            <VariableTile key={child.id} slot={child.slot} name={child.name}
              ancestors={lineage} />
          ))}
          {limit < children.length && (
            <Button size="small" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
              Load more ({Math.min(limit, children.length)}/{children.length})
            </Button>
          )}
        </>
      )}
    </List>
  );
}
