import {
  assert,
  assertEquals,
  assertObjectMatch,
  spy,
  validateStorageAdapterSchema,
} from "../dev_deps.js";

import adapterBuilder from "../adapter.js";
import { Buffer } from "../deps.js";
import { tokenErrs } from "../lib/utils.js";

const resolves = (val) => () => Promise.resolve(val);
const rejects = (val) => () => Promise.reject(val);

const existingNamespace = "foo";
// mock client
const s3 = {
  createBucket: () => Promise.resolve(),
  headBucket: () => Promise.reject({ code: "Http404" }), // bucekt does not exist
  getObject: () => {
    return Promise.resolve({
      Body: new TextEncoder().encode(
        JSON.stringify({
          createdAt: new Date().toISOString(),
          [existingNamespace]: { createdAt: new Date() },
        }),
      ),
    });
  },
  putObject: () => Promise.resolve(),
};

const credentialProvider = {
  getCredentials: () =>
    Promise.resolve({
      awsAccessKeyId: "foo",
      awsSecretKey: "secret",
      sessionToken: "token",
      region: "us-east-1",
    }),
};

const adapter = adapterBuilder("foo", {
  s3,
  credentialProvider,
  getSignedUrl: () => Promise.resolve("https://foo.bar"),
});

const { test } = Deno;

test("adapter", async (t) => {
  await t.step("should implement the port", () => {
    assert(validateStorageAdapterSchema(adapter));
  });

  await t.step("bucket", async (t) => {
    await t.step("should map AWS Token errors to HyperErr", async () => {
      const original = s3.createBucket;

      await Promise.all(
        tokenErrs.map(async (te) => {
          s3.createBucket = () => Promise.reject(new Error(`${te} - found`));
          await adapter.makeBucket(existingNamespace).then(({ ok, status }) => {
            assert(ok === false);
            assert(status === 500);
            s3.createBucket = original;
          });
        }),
      );

      s3.createBucket = original;
    });

    await t.step(
      "rejects with Error if failed to get meta object",
      async () => {
        const original = s3.getObject;
        s3.getObject = spy(rejects(new Error("foo")));

        try {
          await adapter.makeBucket("bar");
          assert(false);
        } catch (err) {
          assertEquals(err.message, "foo");
          s3.getObject = original;
        }
      },
    );

    await t.step(
      "resolves with HyperErr if namespace is invalid name",
      async () => {
        const err = await adapter.makeBucket("../uhoh/invalid-namespace");
        assertEquals(err.ok, false);
        assertEquals(err.msg, "name cannot contain '..'");
      },
    );

    await t.step("makeBucket", async (t) => {
      await t.step(
        "make a bucket and namespace and return the correct shape",
        async () => {
          const res = await adapter.makeBucket("no_foo");
          assert(res.ok);
        },
      );

      await t.step(
        "does NOT create bucket, creates namespace and return the correct shape",
        async () => {
          const original = s3.headBucket;
          const originalCreateBucket = s3.createBucket;
          s3.headBucket = resolves();
          s3.createBucket = spy(resolves());

          const res = await adapter.makeBucket("no_foo");
          assert(res.ok);
          // call to create bucket should not happen
          assertEquals(0, s3.createBucket.calls.length);
          s3.headBucket = original;
          s3.createBucket = originalCreateBucket;
        },
      );

      await t.step(
        "creates the meta document if it doesn't exist",
        async () => {
          const original = s3.getObject;
          s3.getObject = () => Promise.reject(new Error("NoSuchKey - found"));
          s3.putObject = spy(resolves());

          await adapter.makeBucket("no_foo");

          // first call is to create the meta object
          let { Body } = s3.putObject.calls.shift().args.pop();

          Body = JSON.parse(Body);

          assert(Body.createdAt);

          // cleanup
          s3.getObject = original;
        },
      );

      await t.step("updates the meta document", async () => {
        s3.putObject = spy(resolves());

        await adapter.makeBucket("new");

        let { Body } = s3.putObject.calls.shift().args.pop();

        Body = JSON.parse(Body);

        assert(Body.new.createdAt);
        assert(!Body.new.deletedAt);
      });

      await t.step(
        "rejects with Error if failed to create a bucket",
        async () => {
          const original = s3.createBucket;
          s3.createBucket = spy(rejects(new Error("foo")));

          try {
            await adapter.makeBucket("bar");
            assert(false);
          } catch (err) {
            assertEquals(err.message, "foo");
            s3.createBucket = original;
          }
        },
      );

      await t.step(
        "resolves with HyperErr if namespace already exists",
        async () => {
          await adapter.makeBucket(existingNamespace).then(
            ({ ok, msg, status }) => {
              assert(ok === false);
              assertEquals("bucket already exists", msg);
              assert(status === 409);
            },
          );
        },
      );
    });

    await t.step("removeBucket", async (t) => {
      await t.step(
        "remove a namespace and return the correct shape",
        async () => {
          s3.listObjects = spy(
            resolves({
              Contents: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
            }),
          );
          s3.deleteObjects = spy(resolves());

          const res = await adapter.removeBucket(existingNamespace);

          assert(res.ok);

          const { Bucket, Delete } = s3.deleteObjects.calls.shift().args.pop();

          assert(Bucket);
          assertEquals(Delete, {
            Objects: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
          });
        },
      );

      await t.step(
        "should update the meta, setting deletedAt for the namespace",
        async () => {
          s3.listObjects = spy(
            resolves({
              Contents: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
            }),
          );
          s3.deleteObjects = spy(resolves());
          s3.putObject = spy(resolves());

          await adapter.removeBucket(existingNamespace);

          let { Body } = s3.putObject.calls.shift().args.pop();

          Body = JSON.parse(Body);

          assert(Body[existingNamespace].createdAt);
          assert(Body[existingNamespace].deletedAt);
        },
      );

      await t.step(
        "should recursively delete objects",
        async () => {
          let called = false;
          s3.listObjects = spy(
            () => {
              // return isTruncated to trigger recursive call
              if (!called) {
                called = true;
                return Promise.resolve({
                  isTruncated: true,
                  Contents: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
                });
              }

              return Promise.resolve(
                {
                  Contents: [{ Key: "fizz/buzz.jpg" }, {
                    Key: "fizz/fuzz.png",
                  }],
                },
              );
            },
          );
          s3.deleteObjects = spy(resolves());

          const res = await adapter.removeBucket(existingNamespace);

          assert(res.ok);

          assert(s3.deleteObjects.calls.length === 2);

          const { Bucket, Delete } = s3.deleteObjects.calls.shift().args.pop();

          assert(Bucket);
          assertEquals(Delete, {
            Objects: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
          });

          const { Bucket: recurseBucket, Delete: recurseDelete } = s3
            .deleteObjects
            .calls.shift().args.pop();

          assert(recurseBucket);
          assertEquals(recurseDelete, {
            Objects: [{ Key: "fizz/buzz.jpg" }, { Key: "fizz/fuzz.png" }],
          });
        },
      );

      await t.step(
        "remove a namespace and return the correct shape",
        async () => {
          s3.listObjects = spy(
            resolves({
              Contents: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
            }),
          );
          s3.deleteObjects = spy(resolves());

          const res = await adapter.removeBucket(existingNamespace);

          assert(res.ok);

          const { Bucket, Delete } = s3.deleteObjects.calls.shift().args.pop();

          assert(Bucket);
          assertEquals(Delete, {
            Objects: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
          });
        },
      );

      await t.step(
        "should not remove any objects if contents is empty",
        async () => {
          s3.listObjects = spy(
            resolves({ Contents: [] }),
          );
          s3.deleteObjects = spy(resolves());

          const res = await adapter.removeBucket(existingNamespace);

          assert(res.ok);
          assert(s3.deleteObjects.calls.length === 0);
        },
      );

      await t.step(
        "resolves with HyperErr if namespace doesn't exist",
        async () => {
          const err = await adapter.removeBucket("no_foo");
          assertEquals(err.ok, false);
          assertEquals(err.msg, "bucket does not exist");
          assertEquals(err.status, 404);
        },
      );

      await t.step(
        "rejects with Error if failed to remove namespace",
        async () => {
          s3.listObjects = spy(
            resolves({ Contents: [{ Key: "foo" }, { Key: "bar" }] }),
          );
          s3.deleteObjects = spy(rejects(new Error("foo")));

          try {
            await adapter.removeBucket(existingNamespace);
            assert(false);
          } catch (err) {
            assertEquals(err.message, "foo");
          }
        },
      );
    });

    await t.step("listBuckets", async (t) => {
      await t.step("return the correct shape", async () => {
        const original = s3.getObject;
        s3.getObject = () =>
          Promise.resolve({
            Body: new TextEncoder().encode(
              JSON.stringify({
                createdAt: new Date().toISOString(),
                foo: { createdAt: new Date().toISOString() },
                bar: { createdAt: new Date().toISOString() },
                fizz: {
                  createdAt: new Date().toISOString(),
                  deletedAt: new Date().toISOString(),
                },
              }),
            ),
          });

        const res = await adapter.listBuckets();

        assert(res.ok);
        assertEquals(res.buckets, ["foo", "bar"]);

        s3.getObject = original;
      });

      await t.step(
        "rejects with Error if can't fetch meta to list buckets",
        async () => {
          const original = s3.getObject;
          s3.getObject = spy(rejects(new Error("foo")));

          try {
            await adapter.listBuckets("bar");
            assert(false);
          } catch (err) {
            assertEquals(err.message, "foo");
            s3.getObject = original;
          }
        },
      );
    });
  });

  await t.step("object", async (t) => {
    await t.step("passes the correct prefix", async () => {
      s3.putObject = spy(({ body }) => Promise.resolve(body));

      await adapter.putObject({
        bucket: existingNamespace,
        object: "/fizz/buzz/bar.jpg",
        stream: new Buffer(new Uint8Array(4).buffer),
      });

      // no leading slash
      await adapter.putObject({
        bucket: existingNamespace,
        object: "buzz/bar.jpg",
        stream: new Buffer(new Uint8Array(4).buffer),
      });

      assertObjectMatch(s3.putObject.calls.shift(), {
        args: [{ Key: `${existingNamespace}/fizz/buzz/bar.jpg` }],
      });

      assertObjectMatch(s3.putObject.calls.shift(), {
        args: [{ Key: `${existingNamespace}/buzz/bar.jpg` }],
      });
    });

    await t.step("resolves with HyperErr if name is invalid", async () => {
      s3.putObject = spy(({ body }) => Promise.resolve(body));

      const err = await adapter.putObject({
        bucket: existingNamespace,
        object: "/foo/bar/../bar.jpg",
        stream: new Buffer(new Uint8Array(4).buffer),
      });

      assertEquals(err.ok, false);
      assert(typeof err.msg === "string");
    });

    await t.step("putObject", async (t) => {
      await t.step("return the correct shape", async () => {
        s3.putObject = spy(({ body }) => Promise.resolve(body));

        const res = await adapter.putObject({
          bucket: existingNamespace,
          object: "bar.jpg",
          stream: new Buffer(new Uint8Array(4).buffer),
        });

        assert(res.ok);
      });

      await t.step(
        "putObject (useSignedUrl) - return the correct shape",
        async () => {
          const res = await adapter.putObject({
            bucket: existingNamespace,
            object: "bar.jpg",
            useSignedUrl: true,
          });

          assert(res.ok);
          assert(res.url);
        },
      );

      await t.step("rejects with Error if fail to putObject", async () => {
        s3.putObject = spy(rejects(new Error("foo")));

        try {
          await adapter.putObject({
            bucket: existingNamespace,
            object: "bar.jpg",
            stream: new Buffer(new Uint8Array(4).buffer),
          });
          assert(false);
        } catch (err) {
          assertEquals(err.message, "foo");
        }
      });
    });

    await t.step("removeObject", async (t) => {
      await t.step("return the correct shape", async () => {
        s3.deleteObject = spy(resolves());
        const res = await adapter.removeObject({
          bucket: existingNamespace,
          object: "bar.jpg",
        });

        assert(res.ok);
      });

      await t.step("rejects with Error if fail to delete object", async () => {
        s3.deleteObject = spy(rejects(new Error("foo")));

        try {
          await adapter.removeObject({
            bucket: existingNamespace,
            object: "bar.jpg",
          });
          assert(false);
        } catch (err) {
          assertEquals(err.message, "foo");
        }
      });
    });

    await t.step("getObject", async (t) => {
      await t.step("return the correct shape", async () => {
        const reader = new Buffer(new Uint8Array(4));

        const original = s3.getObject;
        s3.getObject = ({ Key }) => {
          if (Key === "meta.json") {
            return original();
          }

          return Promise.resolve({ Body: { buffer: reader } });
        };

        const res = await adapter.getObject({
          bucket: existingNamespace,
          object: "bar.jpg",
        });

        assert(res.read);
        assertEquals(res.length, reader.length);

        s3.getObject = original;
      });

      await t.step(
        "useSignedUrl - return the correct shape",
        async () => {
          const res = await adapter.getObject({
            bucket: existingNamespace,
            object: "bar.jpg",
            useSignedUrl: true,
          });

          assert(res.ok);
          assert(res.url);
        },
      );

      await t.step("rejects with Error if fail to getObject", async () => {
        const original = s3.getObject;
        s3.getObject = ({ Key }) => {
          if (Key === "meta.json") {
            return original();
          }

          return Promise.reject(new Error("foo"));
        };

        try {
          await adapter.getObject({
            bucket: existingNamespace,
            object: "bar.jpg",
          });
          assert(false);
        } catch (err) {
          assertEquals(err.message, "foo");
          s3.getObject = original;
        }
      });
    });

    await t.step("listObject", async (t) => {
      await t.step("return the correct shape", async () => {
        s3.listObjects = spy(
          resolves({ Contents: [{ Key: "foo" }, { Key: "bar" }] }),
        );

        const res = await adapter.listObjects({
          bucket: existingNamespace,
          prefix: "bar",
        });

        assert(res.ok);
        assertEquals(res.objects, ["foo", "bar"]);
      });

      await t.step(
        "rejects with Error if fail to list objects in bucket (with prefix)",
        async () => {
          s3.listObjects = spy(rejects(new Error("foo")));

          try {
            await adapter.listObjects({
              bucket: "foo",
              prefix: "bar",
            });
            assert(false);
          } catch (err) {
            assertEquals(err.message, "foo");
          }
        },
      );
    });
  });
});
