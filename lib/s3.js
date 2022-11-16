export const makeBucket = (s3) => (name) => {
  return s3.createBucket({
    Bucket: name,
  });
};

export const headBucket = (s3) => (name) => {
  return s3.headBucket({
    Bucket: name,
  });
};

export const listBuckets = (s3) => () => {
  return s3.listBuckets();
};

export const putObject = (s3) => ({ bucket, key, body }) => {
  return s3.putObject({
    Bucket: bucket,
    Body: body,
    Key: key,
  });
};

export const removeObject = (s3) => ({ bucket, key }) => {
  return s3.deleteObject({
    Bucket: bucket,
    Key: key,
  });
};

export const removeObjects = (s3) => ({ bucket, keys }) => {
  return s3.deleteObjects({
    Bucket: bucket,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
    },
  });
};

export const getObject = (s3) => ({ bucket, key }) => {
  return s3.getObject({
    Bucket: bucket,
    Key: key,
  });
};

/**
 * https://deno.land/x/aws_s3_presign@1.2.1#options
 */
export const getSignedUrl = (s3) =>
// expires in 5 min by default
({ bucket, key, method, expires = 60 * 5, credentials }) => {
  return Promise.resolve(s3.getSignedUrl({
    accessKeyId: credentials.awsAccessKeyId,
    secretAccessKey: credentials.awsSecretKey,
    sessionToken: credentials.sessionToken,
    region: credentials.region,
    /**
     * S3 bucket names must be lowercase.
     * Furthermore, case is ignored in the bucket name portion of an s3 url.
     *
     * The one exception to this is with presigned urls.
     * If the url used has uppercase parts in the bucket name portion of the url,
     * this will cause the signature to not match the signature used to sign
     * the request.
     *
     * So we lowercase the bucket name when generating a presigned url,
     * to prevent a signature mismatch.
     *
     * TODO: should this be done in the library we are consuming?
     */
    bucketName: bucket.toLowerCase(),
    objectPath: key.startsWith("/") ? key : `/${key}`,
    expiresIn: expires,
    method,
  }));
};

export const listObjects = (s3) => ({ bucket, prefix }) => {
  return s3.listObjects({
    Bucket: bucket,
    Prefix: prefix,
  });
};
