import { describe, it, expect } from "vitest";
import { moveId, toggleAttachment } from "./attachment-order";

describe("attachment-order", () => {
  it("appends on attach so a new item lands last", () => {
    expect(toggleAttachment(["sk2"], "sk1")).toEqual(["sk2", "sk1"]);
  });

  it("detaches without disturbing the rest of the order", () => {
    expect(toggleAttachment(["sk2", "sk1", "sk3"], "sk1")).toEqual(["sk2", "sk3"]);
  });

  it("moves an id and leaves out-of-range moves alone", () => {
    expect(moveId(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], 0, 3)).toEqual(["a", "b", "c"]);
  });
});
