import { useMemo, useSyncExternalStore } from "react";
import { readVariable, sameVariable, type VariableLocation } from "../inspection/variableLocation";
import { readStructure, sameStructure } from "../inspection/variableStructure";
import { variableWatcher } from "../inspection/variableWatcher";
import { benchmarkVariant, timed } from "./benchmark/metrics";

const noSubscription = () => () => {};

export function useVariable(location: VariableLocation, visible: boolean) {
  const visibilityKey = benchmarkVariant() === "stableWatchers" ? undefined : visible;
  const subscription = useMemo(
    () => variableWatcher.watch(() =>
      timed("variable.read", () => readVariable(location)), sameVariable),
    [location, visibilityKey],
  );
  return useSyncExternalStore(
    visible ? subscription.subscribe : noSubscription,
    subscription.getSnapshot,
  );
}

export function useStructure(value: object, visible: boolean) {
  const visibilityKey = benchmarkVariant() === "stableWatchers" ? undefined : visible;
  const subscription = useMemo(
    () => variableWatcher.watch(() =>
      timed("structure.read", () => readStructure(value)), sameStructure),
    [value, visibilityKey],
  );
  return useSyncExternalStore(
    visible ? subscription.subscribe : noSubscription,
    subscription.getSnapshot,
  );
}

