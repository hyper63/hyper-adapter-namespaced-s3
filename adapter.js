import { Buffer, crocks, join, R, readAll } from "./deps.js";

import * as lib from "./lib/s3.js";

import { checkName, mapErr } from "./lib/utils.js";

const { Async } = crocks;
const {
  assocPath,
  assoc,
  dissoc,
  keys,
  always,
  compose,
  pluck,
  prop,
  map,
  identity,
  path,
  has,
  ifElse,
  isNil,
  complement,
  defaultTo,
} = R;

const notHas = (prop) => complement(has(prop));
const createPrefix = (bucket, name) => join(bucket, name);

export const HYPER_BUCKET_PREFIX = "hyper-storage-namespaced";

const [META, CREATED_AT, DELETED_AT] = ["meta.json", "createdAt", "deletedAt"];

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
 * @param {{ s3: any, factory: any }} aws
 * @returns
 */
export default function (bucketPrefix, aws) {
  const { s3 } = aws;

  const client = {
    makeBucket: Async.fromPromise(lib.makeBucket(s3)),
    listBuckets: Async.fromPromise(lib.listBuckets(s3)),
    putObject: Async.fromPromise(lib.putObject(s3)),
    removeObject: Async.fromPromise(lib.removeObject(s3)),
    removeObjects: Async.fromPromise(lib.removeObjects(s3)),
    getObject: Async.fromPromise(lib.getObject(s3)),
    listObjects: Async.fromPromise(lib.listObjects(s3)),
  };

  // The single bucket used for all objects
  const namespacedBucket = `${HYPER_BUCKET_PREFIX}-${bucketPrefix}`;

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
    return Async.of()
      .chain(() => client.getObject({ bucket: namespacedBucket, key: META }))
      /**
       * Find or create the meta.json object
       */
      .bichain(
        (err) => {
          return err.message.includes("NoSuchKey")
            // Create
            ? Async.of({ [CREATED_AT]: new Date().toISOString() })
              .chain((meta) => saveMeta(meta).map(() => meta))
            : Async.Rejected(err); // Some other error
        },
        // Found
        (r) =>
          Async.of(r)
            .map((r) => JSON.parse(new TextDecoder().decode(r.Body))),
      );
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
    });
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
                pluck("Key"),
                prop("Contents"),
              ),
            )
            .chain((keys) =>
              client.removeObjects({ bucket: namespacedBucket, keys })
            )
            .chain(() =>
              // https://doc.deno.land/https://aws-api.deno.dev/v0.3/services/s3.ts?docs=full/~/ListObjectsOutput#IsTruncated
              data.isTruncated
                ? removeObjects(prefix) // recurse to delete more objects
                : Async.Resolved()
            ),
      );
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
        Async.Resolved, // does exist
        Async.Rejected, // does not exist
      ));
  }

  /**
   * Create a namespace (prefix/folder) within the s3 bucket
   * recording it's existence in the meta file
   *
   * @param {string} name
   * @returns {Promise<ResponseMsg>}
   */
  function makeNamespace(name) {
    // will succeed if the bucket already exists
    return client.makeBucket(namespacedBucket)
      .chain(() => checkName(name))
      .chain(getMeta)
      .chain((meta) =>
        checkNamespaceExists(meta, name)
          .bichain(
            /**
             * Set a key for the new namespace
             * NOTE: this also removes any deletedAt for the namespace
             */
            () =>
              Async.Resolved(
                assoc(name, { [CREATED_AT]: new Date().toISOString() }, meta),
              ),
            // The namespace already exists
            () => Async.Rejected("bucket already exists"),
          )
      )
      .chain(saveMeta)
      .bimap(
        mapErr,
        identity,
      )
      .bimap(
        (msg) => ({ ok: false, msg }),
        always({ ok: true }),
      ).toPromise();
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
            () => Async.Rejected("bucket does not exist"),
            () => removeObjects(name),
          )
          .chain(
            () =>
              Async.of(
                assocPath([name, DELETED_AT], new Date().toISOString(), meta),
              )
                .chain(saveMeta),
          )
      )
      .bimap(
        mapErr,
        identity,
      ).bimap(
        (msg) => ({ ok: false, msg }),
        always({ ok: true }),
      ).toPromise();
  }

  /**
   * @returns {Promise<ResponseBuckets>}
   */
  function listNamespaces() {
    return getMeta()
      .map(dissoc(CREATED_AT))
      .map(keys)
      .bimap(
        mapErr,
        identity,
      ).bimap(
        (msg) => ({ ok: false, msg }),
        (bucketNamesArr) => ({ ok: true, buckets: bucketNamesArr }),
      ).toPromise();
  }

  /**
   * @param {PutObjectArgs}
   * @returns {Promise<ResponseOk>}
   */
  async function putObject({ bucket, object, stream }) {
    const arrBuffer = await readAll(stream);

    return checkName(bucket)
      .chain(() => checkName(object))
      .chain(getMeta)
      .chain(
        (meta) => checkNamespaceExists(meta, bucket),
      )
      .chain(() =>
        client.putObject({
          bucket: namespacedBucket,
          key: createPrefix(bucket, object),
          body: arrBuffer,
        })
      )
      .bimap(
        mapErr,
        identity,
      ).bimap(
        (msg) => ({ ok: false, msg }),
        always({ ok: true }),
      ).toPromise();
  }

  /**
   * @param {ObjectArgs}
   * @returns {Promise<ResponseOk>}
   */
  function removeObject({ bucket, object }) {
    return checkName(bucket)
      .chain(() => checkName(object))
      .chain(getMeta)
      .chain(
        (meta) => checkNamespaceExists(meta, bucket),
      )
      .chain(() =>
        client.removeObject({
          bucket: namespacedBucket,
          key: createPrefix(bucket, object),
        })
      )
      .bimap(
        mapErr,
        identity,
      ).bimap(
        (msg) => ({ ok: false, msg }),
        always({ ok: true }),
      ).toPromise();
  }

  /**
   * @param {ObjectArgs}
   * @returns {Promise<Buffer>}
   */
  function getObject({ bucket, object }) {
    return checkName(bucket)
      .chain(() => checkName(object))
      .chain(getMeta)
      .chain(
        (meta) => checkNamespaceExists(meta, bucket),
      )
      .chain(() =>
        client.getObject({
          bucket: namespacedBucket,
          key: createPrefix(bucket, object),
        })
      )
      .bimap(
        mapErr,
        path(["Body", "buffer"]),
      ).bimap(
        (msg) => ({ ok: false, msg }),
        (arrayBuffer) => new Buffer(arrayBuffer),
      ).toPromise();
  }

  /**
   * @param {ListObjectsArgs}
   * @returns {Promise<ResponseObjects>}
   */
  function listObjects({ bucket, prefix }) {
    return checkName(bucket)
      .chain(() => checkName(prefix))
      .chain(getMeta)
      .chain(
        (meta) => checkNamespaceExists(meta, bucket),
      )
      .chain(() =>
        client.listObjects({
          bucket: namespacedBucket,
          prefix: createPrefix(bucket, prefix),
        })
      )
      .bimap(
        mapErr,
        compose(
          map(prop("Key")),
          prop("Contents"),
        ),
      ).bimap(
        (msg) => ({ ok: false, msg }),
        (objectNamesArr) => ({ ok: true, objects: objectNamesArr }),
      ).toPromise();
  }

  return Object.freeze({
    makeBucket: makeNamespace,
    removeBucket: removeNamespace,
    listBuckets: listNamespaces,
    putObject,
    removeObject,
    getObject,
    listObjects,
  });
}
