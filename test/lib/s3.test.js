import {
  assert,
  assertEquals,
  assertObjectMatch,
  spy,
} from "../../dev_deps.js";

import {
  getObject,
  listBuckets,
  listObjects,
  makeBucket,
  putObject,
  removeObject,
  removeObjects,
} from "../../lib/s3.js";

const { test } = Deno;

const resolves = (val) => () => Promise.resolve(val);

const s3 = {};

test("makeBucket - should pass correct shape", async () => {
  const name = "foo";
  s3.createBucket = spy(resolves());

  await makeBucket(s3)(name);

  assertObjectMatch(s3.createBucket.calls.shift(), {
    args: [{ Bucket: name }],
  });
});

test("listBuckets - should pass correct shape", async () => {
  s3.listBuckets = spy(resolves());

  await listBuckets(s3)();

  assert(s3.listBuckets.calls.shift());
});

test("putObject - should pass correct shape", async () => {
  const bucket = "buck";
  const key = "foo.jpg";
  // See https://github.com/denoland/deno_std/issues/1842
  // const body = new Uint8Array();
  const body = {};

  s3.putObject = spy(resolves());

  await putObject(s3)({ bucket, key, body });

  assertObjectMatch(s3.putObject.calls.shift(), {
    args: [{ Bucket: bucket, Key: key, Body: body }],
  });
});

test("removeObject - should pass correct shape", async () => {
  const bucket = "buck";
  const key = "foo.jpg";

  s3.deleteObject = spy(resolves());

  await removeObject(s3)({ bucket, key });

  assertObjectMatch(s3.deleteObject.calls.shift(), {
    args: [{ Bucket: bucket, Key: key }],
  });
});

test("removeObjects - should pass correct shape", async () => {
  const bucket = "buck";
  const keys = ["foo.jpg"];

  s3.deleteObjects = spy(resolves());

  await removeObjects(s3)({ bucket, keys });

  const { Bucket, Delete } = s3.deleteObjects.calls.shift().args.pop();

  assertEquals(Bucket, bucket);
  assertEquals(Delete, { Objects: [{ Key: "foo.jpg" }] });
});

test("getObject - should pass correct shape", async () => {
  const bucket = "buck";
  const key = "foo.jpg";

  s3.getObject = spy(resolves());

  await getObject(s3)({ bucket, key });

  assertObjectMatch(s3.getObject.calls.shift(), {
    args: [{ Bucket: bucket, Key: key }],
  });
});

test("listObjects - should pass correct shape", async () => {
  const bucket = "buck";
  const prefix = "foo";

  s3.listObjects = spy(resolves());

  await listObjects(s3)({ bucket, prefix });

  assertObjectMatch(s3.listObjects.calls.shift(), {
    args: [{ Bucket: bucket, Prefix: prefix }],
  });
});
