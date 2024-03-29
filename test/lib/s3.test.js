import { assert, assertEquals, assertObjectMatch, spy } from '../../dev_deps.js'

import {
  getObject,
  getSignedUrl,
  headBucket,
  listBuckets,
  listObjects,
  makeBucket,
  putObject,
  removeObject,
  removeObjects,
} from '../../lib/s3.js'

const { test } = Deno

const resolves = (val) => () => Promise.resolve(val)

const s3 = {}

test('s3', async (t) => {
  await t.step('makeBucket - should pass correct shape', async () => {
    const name = 'foo'
    s3.createBucket = spy(resolves())

    await makeBucket(s3)(name)

    assertObjectMatch(s3.createBucket.calls.shift(), {
      args: [{ Bucket: name }],
    })
  })

  await t.step('headBucket - should pass correct shape', async () => {
    const name = 'foo'
    s3.headBucket = spy(resolves())

    await headBucket(s3)(name)

    assertObjectMatch(s3.headBucket.calls.shift(), {
      args: [{ Bucket: name }],
    })
  })

  await t.step('listBuckets - should pass correct shape', async () => {
    s3.listBuckets = spy(resolves())

    await listBuckets(s3)()

    assert(s3.listBuckets.calls.shift())
  })

  await t.step('putObject - should pass correct shape', async () => {
    const bucket = 'buck'
    const key = 'foo.jpg'
    // See https://github.com/denoland/deno_std/issues/1842
    // const body = new Uint8Array();
    const body = {}

    const mockManagedUpload = spy(resolves())
    const mockS3 = { managedUpload: mockManagedUpload }

    await putObject(mockS3)({ bucket, key, body })

    assertObjectMatch(mockManagedUpload.calls.shift().args.pop(), {
      Bucket: bucket,
      Key: key,
      Body: body,
    })
  })

  await t.step('removeObject - should pass correct shape', async () => {
    const bucket = 'buck'
    const key = 'foo.jpg'

    s3.deleteObject = spy(resolves())

    await removeObject(s3)({ bucket, key })

    assertObjectMatch(s3.deleteObject.calls.shift(), {
      args: [{ Bucket: bucket, Key: key }],
    })
  })

  await t.step('removeObjects - should pass correct shape', async () => {
    const bucket = 'buck'
    const keys = ['foo.jpg']

    s3.deleteObjects = spy(resolves())

    await removeObjects(s3)({ bucket, keys })

    const { Bucket, Delete } = s3.deleteObjects.calls.shift().args.pop()

    assertEquals(Bucket, bucket)
    assertEquals(Delete, { Objects: [{ Key: 'foo.jpg' }] })
  })

  await t.step('getObject - should pass correct shape', async () => {
    const bucket = 'buck'
    const key = 'foo.jpg'

    s3.getObject = spy(resolves())

    await getObject(s3)({ bucket, key })

    assertObjectMatch(s3.getObject.calls.shift(), {
      args: [{ Bucket: bucket, Key: key }],
    })
  })

  await t.step('getSignedUrl - should pass correct shape', async () => {
    const bucket = 'Buck'
    const key = 'foo.jpg'
    const method = 'PUT'
    const expires = 60 * 5

    s3.getSignedUrl = spy(resolves())

    await getSignedUrl(s3)({
      bucket,
      key,
      method,
      expires,
      credentials: {
        awsAccessKeyId: 'foo',
        awsSecretKey: 'secret',
        sessionToken: 'token',
        region: 'us-east-1',
      },
    })

    assertObjectMatch(s3.getSignedUrl.calls.shift(), {
      args: [{
        accessKeyId: 'foo',
        secretAccessKey: 'secret',
        sessionToken: 'token',
        region: 'us-east-1',
        bucketName: bucket.toLowerCase(),
        objectPath: `/${key}`,
        expiresIn: expires,
        method,
      }],
    })
  })

  await t.step('listObjects - should pass correct shape', async () => {
    const bucket = 'buck'
    const prefix = 'foo'

    s3.listObjects = spy(resolves())

    await listObjects(s3)({ bucket, prefix })

    assertObjectMatch(s3.listObjects.calls.shift(), {
      args: [{ Bucket: bucket, Prefix: prefix }],
    })
  })
})
