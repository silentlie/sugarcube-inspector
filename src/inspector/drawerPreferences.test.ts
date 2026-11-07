import { expect, it } from "vitest";
import { decodeDrawerPreferences } from "./drawerPreferences";

it("accepts only finite, nonnegative drawer geometry and supported modes", () => {
  const value = { mode: "click", width: 480, tabTop: 120 };
  expect(decodeDrawerPreferences(JSON.stringify(value))).toEqual(value);
  for (const data of [null, {}, { ...value, mode: "other" }, { ...value, width: -1 }, { ...value, width: "480" }, { ...value, tabTop: Infinity }]) {
    expect(decodeDrawerPreferences(JSON.stringify(data))).toBeUndefined();
  }
  expect(decodeDrawerPreferences("{invalid")).toBeUndefined();
});
