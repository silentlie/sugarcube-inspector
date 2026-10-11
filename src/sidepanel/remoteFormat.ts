import type { RemoteProperty, RemoteValue } from "../debugger/protocol";

/** Formats CDP metadata without evaluating the inspected object's getters. */
export function describeRemoteValue(value?: RemoteValue): string {
  if (!value) return "undefined";
  if (value.subtype === "null") return "null";
  if (value.unserializableValue) return value.unserializableValue;
  if ("value" in value && value.value !== undefined) {
    if (typeof value.value === "string") return JSON.stringify(value.value);
    return String(value.value);
  }
  return value.description ?? value.className ?? value.type;
}

export function describeProperty(property: RemoteProperty): string {
  if (property.getter && property.setter) return "[Getter/Setter]";
  if (property.getter) return "[Getter]";
  if (property.setter) return "[Setter]";
  return describeRemoteValue(property.value);
}
