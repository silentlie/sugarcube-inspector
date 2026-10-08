import { deserialize, serialize } from "@ungap/structured-clone";

export type SerializedValue = ReturnType<typeof serialize>;

export function serializeValue(value: unknown): SerializedValue {
  return serialize(value, { lossy: true });
}

export function deserializeValue(value: SerializedValue): unknown {
  return deserialize(value);
}
