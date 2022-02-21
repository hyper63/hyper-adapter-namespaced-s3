import { assert, assertEquals, assertThrows } from "../../dev_deps.js";

import { checkName, HyperErr, isHyperErr } from "../../lib/utils.js";

const { test } = Deno;

test("HyperErr - should accept nil, string, or object, and throw otherwise", () => {
  assert(HyperErr());
  assert(HyperErr({}));
  assert(HyperErr("foo"));
  assert(HyperErr({ msg: "foo" }));

  assertThrows(() => HyperErr({ foo: "bar" }));
  assertThrows(() => HyperErr([]));
  assertThrows(() => HyperErr(function () {}));
});

test("HyperErr - should set fields", () => {
  const base = HyperErr();
  const withStatus = HyperErr({ status: 404 });
  const fromStr = HyperErr("foo");
  const fromObj = HyperErr({ msg: "foo" });
  const strip = HyperErr({ msg: "foo", omit: "me" });

  assertEquals(base.ok, false);

  assertEquals(withStatus.status, 404);
  assert(!Object.keys(fromStr).includes("status"));

  assertEquals(fromStr.msg, "foo");
  assertEquals(fromObj.msg, "foo");
  assert(!strip.omit);
});

test("checkName - should resolve with the name", async () => {
  const name = "/path/to/file/./here";

  await checkName(name)
    .map((res) => assertEquals(res, name))
    .toPromise();
});

test("checkName - should reject with a HyperErr", async () => {
  const invalidName = "/path/../to/a/file";

  await checkName(invalidName)
    .coalesce(
      (err) => {
        assert(isHyperErr(err));
        assert(typeof err.msg === "string");
        return;
      },
      () => {
        throw new Error("this shouldn't happen");
      },
    )
    .toPromise();
});
