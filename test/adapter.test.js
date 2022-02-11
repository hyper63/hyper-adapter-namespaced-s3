import {
  assert,
  assertEquals,
  assertObjectMatch,
  spy,
  validateStorageAdapterSchema,
} from "../dev_deps.js";

import adapterBuilder from "../adapter.js";
import { Buffer } from "../deps.js";

const resolves = (val) => () => Promise.resolve(val);
const rejects = (val) => () => Promise.reject(val);

const existingNamespace = "foo";
// mock client
const s3 = {
  createBucket: () => Promise.resolve(),
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

test("should implement the port", () => {
  assert(validateStorageAdapterSchema(adapter));
});

test("makeBucket - make a bucket and namespace and return the correct shape", async () => {
  const res = await adapter.makeBucket("no_foo");
  assert(res.ok);
});

test("makeBucket - creates the meta document if it doesn't exist", async () => {
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
});

test("makeBucket - updates the meta document", async () => {
  s3.putObject = spy(resolves());

  await adapter.makeBucket("new");

  let { Body } = s3.putObject.calls.shift().args.pop();

  Body = JSON.parse(Body);

  assert(Body.new.createdAt);
  assert(!Body.new.deletedAt);
});

test("makeBucket - rejects if failed to create a bucket and return correct shape", async () => {
  const original = s3.createBucket;
  s3.createBucket = spy(rejects(new Error("foo")));

  try {
    await adapter.makeBucket("bar");
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "foo");
    s3.createBucket = original;
  }
});

test("makeBucket - rejects if namespace already exists", async () => {
  await adapter.makeBucket(existingNamespace).then(() => {
    assert(false);
  }).catch((err) => {
    assert(!err.ok);
    assertEquals("bucket already exists", err.msg);
  });
});

test("all - fail to get meta object and return correct shape", async () => {
  const original = s3.getObject;
  s3.getObject = spy(rejects(new Error("foo")));

  try {
    await adapter.makeBucket("bar");
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "foo");
    s3.getObject = original;
  }
});

test("all - namespace is invalid name", async () => {
  try {
    await adapter.makeBucket("../uhoh/invalid-namespace");
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "name cannot contain '..'");
  }
});

test("removeBucket - remove a namespace and return the correct shape", async () => {
  s3.listObjects = spy(
    resolves({ Contents: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }] }),
  );
  s3.deleteObjects = spy(resolves());

  const res = await adapter.removeBucket(existingNamespace);

  assert(res.ok);

  const { Bucket, Delete } = s3.deleteObjects.calls.shift().args.pop();

  assert(Bucket);
  assertEquals(Delete, {
    Objects: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
  });
});

test("removeBucket - should update the meta, setting deletedAt for the namespace", async () => {
  s3.listObjects = spy(
    resolves({ Contents: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }] }),
  );
  s3.deleteObjects = spy(resolves());
  s3.putObject = spy(resolves());

  await adapter.removeBucket(existingNamespace);

  let { Body } = s3.putObject.calls.shift().args.pop();

  Body = JSON.parse(Body);

  assert(Body[existingNamespace].createdAt);
  assert(Body[existingNamespace].deletedAt);
});

test("removeBucket - should recursively delete objects", async () => {
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
        { Contents: [{ Key: "fizz/buzz.jpg" }, { Key: "fizz/fuzz.png" }] },
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

  const { Bucket: recurseBucket, Delete: recurseDelete } = s3.deleteObjects
    .calls.shift().args.pop();

  assert(recurseBucket);
  assertEquals(recurseDelete, {
    Objects: [{ Key: "fizz/buzz.jpg" }, { Key: "fizz/fuzz.png" }],
  });
});

test("removeBucket - remove a namespace and return the correct shape", async () => {
  s3.listObjects = spy(
    resolves({ Contents: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }] }),
  );
  s3.deleteObjects = spy(resolves());

  const res = await adapter.removeBucket(existingNamespace);

  assert(res.ok);

  const { Bucket, Delete } = s3.deleteObjects.calls.shift().args.pop();

  assert(Bucket);
  assertEquals(Delete, {
    Objects: [{ Key: "fizz/foo.jpg" }, { Key: "fizz/bar.png" }],
  });
});

test("removeBucket - should not remove any objects if contents is empty", async () => {
  s3.listObjects = spy(
    resolves({ Contents: [] }),
  );
  s3.deleteObjects = spy(resolves());

  const res = await adapter.removeBucket(existingNamespace);

  assert(res.ok);
  assert(s3.deleteObjects.calls.length === 0);
});

test("removeBucket - rejects if namespace doesn't exist", async () => {
  try {
    await adapter.removeBucket("no_foo");
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "bucket does not exist");
  }
});

test("removeBucket - rejects if failed to remove namespace and return correct shape", async () => {
  s3.listObjects = spy(
    resolves({ Contents: [{ Key: "foo" }, { Key: "bar" }] }),
  );
  s3.deleteObjects = spy(rejects(new Error("foo")));

  try {
    await adapter.removeBucket(existingNamespace);
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "foo");
  }
});

test("listBuckets - return the correct shape", async () => {
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

test("listBuckets - fail and return correct shape", async () => {
  const original = s3.getObject;
  s3.getObject = spy(rejects(new Error("foo")));

  try {
    await adapter.listBuckets("bar");
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "foo");
    s3.getObject = original;
  }
});

test("putObject - return the correct shape", async () => {
  s3.putObject = spy(({ body }) => Promise.resolve(body));

  const res = await adapter.putObject({
    bucket: existingNamespace,
    object: "bar.jpg",
    stream: new Buffer(new Uint8Array(4).buffer),
  });

  assert(res.ok);
});

test("putObject (useSignedUrl) - return the correct shape", async () => {
  const res = await adapter.putObject({
    bucket: existingNamespace,
    object: "bar.jpg",
    useSignedUrl: true,
  });

  assert(res.ok);
  assert(res.url);
});

test("all - passes the correct prefix", async () => {
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

test("all - reject if name is invalid", async () => {
  s3.putObject = spy(({ body }) => Promise.resolve(body));

  await adapter.putObject({
    bucket: existingNamespace,
    object: "/foo/bar/../bar.jpg",
    stream: new Buffer(new Uint8Array(4).buffer),
  })
    .then(() => assert(false))
    .catch((err) => {
      assert(!err.ok);
      assert(typeof err.msg === "string");
    });
});

test("putObject - fail and return correct shape", async () => {
  s3.putObject = spy(rejects(new Error("foo")));

  try {
    await adapter.putObject({
      bucket: existingNamespace,
      object: "bar.jpg",
      stream: new Buffer(new Uint8Array(4).buffer),
    });
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "foo");
  }
});

test("removeObject - return the correct shape", async () => {
  s3.deleteObject = spy(resolves());
  const res = await adapter.removeObject({
    bucket: existingNamespace,
    object: "bar.jpg",
  });

  assert(res.ok);
});

test("removeObject - fail and return correct shape", async () => {
  s3.deleteObject = spy(rejects(new Error("foo")));

  try {
    await adapter.removeObject({
      bucket: existingNamespace,
      object: "bar.jpg",
    });
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "foo");
  }
});

test("getObject - return the correct shape", async () => {
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

test("getObject - fail and return correct shape", async () => {
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
    assertEquals(err.ok, false);
    assertEquals(err.msg, "foo");
    s3.getObject = original;
  }
});

test("listObjects - return the correct shape", async () => {
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

test("listObjects - fail and return correct shape", async () => {
  s3.listObjects = spy(rejects(new Error("foo")));

  try {
    await adapter.listObjects({
      bucket: "foo",
      prefix: "bar",
    });
    assert(false);
  } catch (err) {
    assertEquals(err.ok, false);
    assertEquals(err.msg, "foo");
  }
});
