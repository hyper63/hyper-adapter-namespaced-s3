import { Buffer, crocks, HyperErr, join, R, readAll } from './deps.js'

import * as lib from './lib/s3.js'

import { checkName, handleHyperErr, isAwsTokenErr } from './lib/utils.js'

const { Async } = crocks
const {
  assocPath,
  assoc,
  dissoc,
  keys,
  always,
  filter,
  compose,
  pluck,
  prop,
  propEq,
  map,
  identity,
  path,
  has,
  ifElse,
  isNil,
  complement,
  defaultTo,
} = R

const notHas = (prop) => complement(has(prop))
const createPrefix = (bucket, name) => join(bucket, name)
const asyncifyHandle = (fn) =>
  Async.fromPromise(
    (...args) =>
      Promise.resolve(fn(...args))
        .catch((err) => {
          // Map token errs to a HyperErr
          // TODO: emit 'unhealthy' when event listener api is finalized
          if (isAwsTokenErr(err)) {
            throw HyperErr({ status: 500, msg: 'AWS credentials are invalid' })
          }
          throw err
        }),
  )

export const HYPER_BUCKET_PREFIX = 'hyper-storage-namespaced'

const [META, CREATED_AT, DELETED_AT, BUCKET_NOT_FOUND_CODE, NO_SUCH_KEY] = [
  'meta.json',
  'createdAt',
  'deletedAt',
  'Http404',
  'NoSuchKey',
]

/**
 * @typedef {Object} PutObjectArgs
 * @property {string} bucket
 * @property {string} object
 * @property {any} stream
 *
 * @typedef {Object} ObjectArgs
 * @property {string} bucket
 * @property {string} object
 *
 * @typedef {Object} ListObjectsArgs
 * @property {string} bucket
 * @property {string} [prefix]
 *
 * @typedef {Object} Msg
 * @property {string} [msg]
 *
 * @typedef {Object} Buckets
 * @property {string[]} buckets
 *
 * @typedef {Object} Objects
 * @property {string[]} objects
 *
 * @typedef {Object} ResponseOk
 * @property {boolean} ok
 *
 * @typedef {Msg & ResponseOk} ResponseMsg
 * @typedef {Buckets & ResponseOk} ResponseBuckets
 * @typedef {Objects & ResponseOk} ResponseObjects
 */

/**
 * @param {{ s3: any, factory: any, getSignedUrl: any, credentialProvider: any }} aws
 * @returns
 */
export default function (bucketPrefix, aws) {
  const { s3, getSignedUrl, credentialProvider } = aws

  const getCredentials = Async.fromPromise(credentialProvider.getCredentials)

  const client = {
    makeBucket: asyncifyHandle(lib.makeBucket(s3)),
    headBucket: asyncifyHandle(lib.headBucket(s3)),
    listBuckets: asyncifyHandle(lib.listBuckets(s3)),
    putObject: asyncifyHandle(lib.putObject(s3)),
    removeObject: asyncifyHandle(lib.removeObject(s3)),
    removeObjects: asyncifyHandle(lib.removeObjects(s3)),
    getObject: asyncifyHandle(lib.getObject(s3)),
    getSignedUrl: asyncifyHandle(lib.getSignedUrl({ getSignedUrl })),
    listObjects: asyncifyHandle(lib.listObjects(s3)),
  }

  // The single bucket used for all objects
  const namespacedBucket = `${HYPER_BUCKET_PREFIX}-${bucketPrefix}`
  /**
   * Check if the bucket exists, and create if not
   */
  function findOrCreateBucket() {
    return client.headBucket(namespacedBucket)
      .bichain(
        ifElse(
          propEq('code', BUCKET_NOT_FOUND_CODE),
          always(Async.Resolved(false)), // bucket does not exist
          Async.Rejected, // some unknown err, so bubble
        ),
        always(Async.Resolved(true)),
      )
      .chain((exists) => exists ? Async.Resolved() : client.makeBucket(namespacedBucket))
  }

  /**
   * Get the meta.json for the namespaced s3 bucket
   * which holds information like namespace names and when they were created
   *
   * If meta object does not exist, it will be created.
   * Otherwise, will reject if an unhandled error is received.
   *
   * @returns {object}
   */
  function getMeta() {
    return findOrCreateBucket()
      .chain(() =>
        client.getObject({ bucket: namespacedBucket, key: META })
          /**
           * Find or create the meta.json object
           */
          .bichain(
            (err) => {
              return err.message.includes(NO_SUCH_KEY)
                // Create
                ? Async.of({ [CREATED_AT]: new Date().toISOString() })
                  .chain((meta) => saveMeta(meta).map(() => meta))
                : Async.Rejected(err) // Some other error
            },
            // Found
            (r) =>
              Async.of(r)
                .map((r) => JSON.parse(new TextDecoder().decode(r.Body))),
          )
      )
  }

  /**
   * Save the meta object in the namespaced bucket
   * as meta.json
   */
  function saveMeta(meta) {
    return client.putObject({
      bucket: namespacedBucket,
      key: META,
      body: JSON.stringify(meta),
    })
  }

  /**
   * grab a list of objects at the prefix
   * remove them
   * check if list was truncated, and recurse if so
   * when recursing is done, all object under prefix have been removed
   */
  function removeObjects(prefix) {
    return client.listObjects({
      bucket: namespacedBucket,
      prefix,
    })
      .chain(
        (data) =>
          Async.of(data)
            // gather the keys
            .map(
              compose(
                pluck('Key'),
                prop('Contents'),
              ),
            )
            .chain((keys) =>
              keys.length
                ? client.removeObjects({ bucket: namespacedBucket, keys })
                : Async.Resolved()
            )
            .chain(() =>
              // https://doc.deno.land/https://aws-api.deno.dev/v0.3/services/s3.ts?docs=full/~/ListObjectsOutput#IsTruncated
              data.isTruncated
                ? removeObjects(prefix) // recurse to delete more objects
                : Async.Resolved()
            ),
      )
  }

  /**
   * check the provided meta object for the existence
   * of the provided namespace
   *
   * the namespace may have been deleted, so we check for if the key exists
   * and if so, if the deletedAt key is set
   */
  function checkNamespaceExists(meta, name) {
    return Async.of(meta)
      .map(
        compose(
          ifElse(
            isNil,
            always(false), // no namespace key
            notHas(DELETED_AT), // set deletedAt means namespace was deleted, so does not exist
          ),
          prop(name),
          defaultTo({}),
        ),
      )
      .chain(ifElse(
        identity,
        Async.Resolved,
        () =>
          Async.Rejected(
            HyperErr({ status: 404, msg: 'bucket does not exist' }),
          ),
      ))
  }

  function putObjectOrSignedUrl({ bucket, object, stream, useSignedUrl }) {
    const key = createPrefix(bucket, object)

    if (!useSignedUrl) {
      return Async.of(stream)
        /**
         * TODO: use the new managedUpload api which will accept a
         * stream, buffers into chunks and then uploads to s3 as a multipart upload
         * which would help with large files ie. >5MB and also prevent us
         * from reading the stream into a buffer here
         *
         * See: https://github.com/cloudydeno/deno-aws_api/pull/31
         */
        .chain(Async.fromPromise(readAll))
        .chain((arrBuffer) =>
          client.putObject({
            bucket: namespacedBucket,
            key,
            body: arrBuffer,
          })
        )
        .map(always({ ok: true }))
    }

    return Async.of()
      .chain(getCredentials)
      .chain((credentials) =>
        client.getSignedUrl({
          bucket: namespacedBucket,
          key,
          method: 'PUT',
          credentials,
        })
      )
      .map((url) => ({ ok: true, url }))
  }

  function getObjectOrSignedUrl({ bucket, object, useSignedUrl }) {
    const key = createPrefix(bucket, object)

    if (!useSignedUrl) {
      return client.getObject({
        bucket: namespacedBucket,
        key,
      }).bichain(
        (err) => {
          return err.message.includes(NO_SUCH_KEY)
            ? Async.Rejected(HyperErr({ status: 404, msg: 'object not found' }))
            : Async.Rejected(err) // Some other error
        },
        // Found
        (r) =>
          Async.of(r)
            .map(path(['Body', 'buffer']))
            .map((arrayBuffer) => new Buffer(arrayBuffer)),
      )
    }

    /**
     * Generating a signedUrl has no way of knowing whether or not
     * the object actually exists.
     *
     * Since signedUrls already sort of break of boundary,
     * we are deferring this responsibility for checking the signed url to the consumer
     */
    return Async.of()
      .chain(getCredentials)
      .chain((credentials) =>
        client.getSignedUrl({
          bucket: namespacedBucket,
          key,
          method: 'GET',
          expires: 10000, // expiration is 1 hour
          credentials,
        })
      )
      .map((url) => ({ ok: true, url }))
  }

  /**
   * Create a namespace (prefix/folder) within the s3 bucket
   * recording it's existence in the meta file
   *
   * @param {string} name
   * @returns {Promise<ResponseMsg>}
   */
  function makeNamespace(name) {
    return checkName(name)
      .chain(getMeta)
      .chain((meta) =>
        checkNamespaceExists(meta, name)
          .bichain(
            /**
             * Set a key for the new namespace
             * NOTE: this also removes any deletedAt for the namespace
             */
            () => Async.Resolved(assoc(name, { [CREATED_AT]: new Date().toISOString() }, meta)),
            // The namespace already exists
            () => Async.Rejected(HyperErr({ status: 409, msg: 'bucket already exists' })),
          )
      )
      .chain(saveMeta)
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      ).toPromise()
  }

  /**
   * Remove a namespace aka. folder/prefix in the bucket
   * This is done by simply querying for all of the objects with
   * the prefix and deleting them.
   *
   * If the result isTruncated, then we recurse, until all objects with
   * the prefix are deleted, effectively deleting the namespace.
   *
   * Finally, we remove the bucket from the meta file
   *
   * @param {string} name
   * @returns {Promise<ResponseMsg>}
   */
  function removeNamespace(name) {
    return Async.of(name)
      .chain(checkName)
      .chain(getMeta)
      .chain((meta) =>
        checkNamespaceExists(meta, name)
          .bichain(
            () => Async.Rejected(HyperErr({ status: 404, msg: 'bucket does not exist' })),
            () => removeObjects(name),
          )
          .chain(
            () =>
              Async.of(assocPath([name, DELETED_AT], new Date().toISOString(), meta))
                .chain(saveMeta),
          )
      )
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      ).toPromise()
  }

  /**
   * @returns {Promise<ResponseBuckets>}
   */
  function listNamespaces() {
    return getMeta()
      .map(dissoc(CREATED_AT))
      .map(filter(notHas(DELETED_AT)))
      .map(keys)
      .bichain(
        handleHyperErr,
        (bucketNamesArr) => Async.Resolved({ ok: true, buckets: bucketNamesArr }),
      ).toPromise()
  }

  /**
   * @param {PutObjectArgs}
   * @returns {Promise<ResponseOk>}
   */
  function putObject({ bucket, object, stream, useSignedUrl }) {
    return checkName(bucket)
      .chain(() => checkName(object))
      .chain(getMeta)
      .chain((meta) => checkNamespaceExists(meta, bucket))
      .chain(() => putObjectOrSignedUrl({ bucket, object, stream, useSignedUrl }))
      .bichain(
        handleHyperErr,
        Async.Resolved,
      ).toPromise()
  }

  /**
   * @param {ObjectArgs}
   * @returns {Promise<ResponseOk>}
   */
  function removeObject({ bucket, object }) {
    return checkName(bucket)
      .chain(() => checkName(object))
      .chain(getMeta)
      .chain((meta) => checkNamespaceExists(meta, bucket))
      .chain(() =>
        client.removeObject({
          bucket: namespacedBucket,
          key: createPrefix(bucket, object),
        })
      )
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      ).toPromise()
  }

  /**
   * @param {ObjectArgs}
   * @returns {Promise<{ ok: false, msg?: string, status?: number } | Buffer>}
   */
  function getObject({ bucket, object, useSignedUrl }) {
    return checkName(bucket)
      .chain(() => checkName(object))
      .chain(getMeta)
      .chain((meta) => checkNamespaceExists(meta, bucket))
      .chain(() => getObjectOrSignedUrl({ bucket, object, useSignedUrl }))
      .bichain(
        handleHyperErr,
        Async.Resolved,
      ).toPromise()
  }

  /**
   * @param {ListObjectsArgs}
   * @returns {Promise<ResponseObjects>}
   */
  function listObjects({ bucket, prefix }) {
    return checkName(bucket)
      .chain(() => checkName(prefix))
      .chain(getMeta)
      .chain((meta) => checkNamespaceExists(meta, bucket))
      .chain(() =>
        client.listObjects({
          bucket: namespacedBucket,
          prefix: createPrefix(bucket, prefix),
        })
      )
      .bimap(
        identity,
        compose(
          map(prop('Key')),
          prop('Contents'),
        ),
      ).bichain(
        handleHyperErr,
        (objectNamesArr) => Async.Resolved({ ok: true, objects: objectNamesArr }),
      ).toPromise()
  }

  return Object.freeze({
    makeBucket: makeNamespace,
    removeBucket: removeNamespace,
    listBuckets: listNamespaces,
    putObject,
    removeObject,
    getObject,
    listObjects,
  })
}
