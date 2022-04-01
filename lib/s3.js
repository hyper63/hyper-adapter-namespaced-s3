export const makeBucket = (s3) =>
  (name) => {
    return s3.createBucket({
      Bucket: name,
    });
  };

export const headBucket = (s3) =>
  (name) => {
    return s3.headBucket({
      Bucket: name,
    });
  };

export const listBuckets = (s3) =>
  () => {
    return s3.listBuckets();
  };

export const putObject = (s3) =>
  ({ bucket, key, body }) => {
    return s3.putObject({
      Bucket: bucket,
      Body: body,
      Key: key,
    });
  };

export const removeObject = (s3) =>
  ({ bucket, key }) => {
    return s3.deleteObject({
      Bucket: bucket,
      Key: key,
    });
  };

export const removeObjects = (s3) =>
  ({ bucket, keys }) => {
    return s3.deleteObjects({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
      },
    });
  };

export const getObject = (s3) =>
  ({ bucket, key }) => {
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
      bucketName: bucket,
      objectPath: key.startsWith("/") ? key : `/${key}`,
      expiresIn: expires,
      method,
    }));
  };

/**
 * https://github.com/cloudydeno/deno-aws_api/pull/31#issue-1188903725
 *
 * could have passed _s3 further up,
 * but wanted to keep the standalone api mapping in one place
 */
export const multiPartUpload = (s3) =>
  ({ bucket, key, body, s3: _s3 }) =>
    s3.multiPartUpload(_s3, {
      Bucket: bucket,
      Key: key,
      Body: body,
    });

export const listObjects = (s3) =>
  ({ bucket, prefix }) => {
    return s3.listObjects({
      Bucket: bucket,
      Prefix: prefix,
    });
  };
