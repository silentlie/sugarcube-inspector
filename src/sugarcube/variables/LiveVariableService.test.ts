import { describe, expect, it } from "vitest";
import { LiveVariableService } from "./LiveVariableService";
import type { VariablePath } from "../watch/types";

const path: VariablePath = [
  { type: "property", key: "story" },
  { type: "property", key: "members" },
];

describe("live collection identity tracking", () => {
  it("starts with value equality, then checks live member identity", () => {
    const service = new LiveVariableService();
    const first = { hp: 100 };
    const replacement = { hp: 100 };
    const baseline = { kind: "set" as const, entries: [{ hp: 100 }] };
    const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

    service.beginPoll();
    expect(service.collectionChanged(path, baseline, { kind: "set", entries: [first] }, equal)).toBe(false);
    service.commitPoll();

    service.beginPoll();
    expect(service.collectionChanged(path, baseline, { kind: "set", entries: [replacement] }, equal)).toBe(true);
    service.commitPoll();
  });

  it("does not treat mutations within the same member as membership changes", () => {
    const service = new LiveVariableService();
    const member = { hp: 100 };
    const baseline = { kind: "set" as const, entries: [{ hp: 100 }] };
    service.beginPoll();
    service.collectionChanged(path, baseline, { kind: "set", entries: [member] }, () => true);
    service.commitPoll();

    member.hp = 50;
    service.beginPoll();
    expect(service.collectionChanged(path, baseline, { kind: "set", entries: [member] }, () => false)).toBe(false);
  });

  it("forgets collections no longer observed and resets on snapshots", () => {
    const service = new LiveVariableService();
    const baseline = { kind: "set" as const, entries: [{ hp: 100 }] };
    const first = { hp: 100 };
    const other = { hp: 100 };
    service.beginPoll();
    service.collectionChanged(path, baseline, { kind: "set", entries: [first] }, () => true);
    service.commitPoll();

    service.beginPoll();
    service.commitPoll();
    service.beginPoll();
    expect(service.collectionChanged(path, baseline, { kind: "set", entries: [other] }, () => true)).toBe(false);
    service.commitPoll();

    service.reset();
    service.beginPoll();
    expect(service.collectionChanged(path, baseline, { kind: "set", entries: [first] }, () => true)).toBe(false);
  });
});
