import { assert, assertEquals } from "../../dev_deps.js";

import { checkName, mapErr } from "../../lib/utils.js";

const { test } = Deno;

test("mapErr - should return the string", () => {
  const res = mapErr("foobar");

  assertEquals(res, "foobar");
});

test("mapErr - should return the error message", () => {
  const res = mapErr(new Error("foobar"));

  assertEquals(res, "foobar");
});

test("mapErr - should return the object message", () => {
  const res = mapErr({ message: "foobar" });

  assertEquals(res, "foobar");
});

test("mapErr - should return the stringified thing", () => {
  const res = mapErr({ foo: "bar" });

  assertEquals(res, JSON.stringify({ foo: "bar" }));
});

test("mapErr - should return generic message", () => {
  const res = mapErr(undefined);

  assertEquals(res, "An error occurred");
});

test("checkName - should resolve with the name", async () => {
  const name = "/path/to/file/./here";

  await checkName(name)
    .map((res) => assertEquals(res, name))
    .toPromise();
});

test("checkName - should reject with an array of strings", async () => {
  const invalidName = "/path/../to/a/file";

  await checkName(invalidName)
    .coalesce(
      (errs) => {
        assert(Array.isArray(errs));
        assert(errs.length);
        assert(typeof errs[0] === "string");
        return;
      },
      () => {
        throw new Error("this shouldn't happen");
      },
    )
    .toPromise();
});
