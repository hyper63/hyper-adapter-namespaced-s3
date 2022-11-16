import {
  assert,
  assertEquals,
  assertThrows,
  validateFactorySchema,
} from "../dev_deps.js";

import createFactory from "../mod.js";

const { test } = Deno;

test("mod", async (t) => {
  await t.step("should be a valid schema", () => {
    const factory = createFactory("foo");
    assert(validateFactorySchema(factory));
  });

  await t.step("should error if prefix is longer than 32 characters", () => {
    assertThrows(
      () => createFactory("aprefixlongerthan32characterswowthisisreallylong"),
    );
  });

  await t.step("should error if prefix is falsey", () => {
    assertThrows(
      () => createFactory(""),
    );
  });

  await t.step("load", async (t) => {
    await t.step("should return the aws object", () => {
      const factory = createFactory("foo");
      const res = factory.load();

      assert(res.aws);
      assert(res.aws.s3);
      assert(res.aws.factory);
    });

    await t.step("should use provided credentials", async () => {
      const res = createFactory("foo", {
        awsAccessKeyId: "foo",
        awsSecretKey: "bar",
        region: "fizz",
      }).load();

      await res.aws.factory.ensureCredentialsAvailable();

      assert(true);
    });

    await t.step("should use credentials passed to load", async () => {
      const res = createFactory("foo").load({
        awsAccessKeyId: "foo",
        awsSecretKey: "bar",
        region: "fizz",
      });

      await res.aws.factory.ensureCredentialsAvailable();
      assert(true);
    });

    await t.step(
      "should merge credentials, preferring those passed to adapter",
      async () => {
        const res = createFactory("foo", { awsAccessKeyId: "better-id" }).load({
          awsAccessKeyId: "foo",
          awsSecretKey: "bar",
          region: "fizz",
        });

        await res.aws.factory.ensureCredentialsAvailable();

        assertEquals(res.awsAccessKeyId, "better-id");
        assertEquals(res.awsSecretKey, "bar");
        assertEquals(res.region, "fizz");
      },
    );

    await t.step("should default the region to us-east-1", async () => {
      const res = createFactory("foo").load({
        awsAccessKeyId: "foo",
        awsSecretKey: "bar",
      });

      await res.aws.factory.ensureCredentialsAvailable();

      assertEquals(res.region, "us-east-1");
    });
  });

  await t.step("link", async (t) => {
    await t.step("should return an adapter", () => {
      const factory = createFactory("foo");
      const adapter = factory.link({
        prefix: "foo",
        aws: {
          s3: {},
          credentialProvider: {
            getCredentials: () => Promise.resolve(),
          },
          getSignedUrl: () => Promise.resolve(),
        },
      })();

      assert(adapter);
      assertEquals(typeof adapter, "object");
      assert(adapter.makeBucket);
    });
  });
});
