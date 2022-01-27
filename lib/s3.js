export const makeBucket = (s3) =>
  (name) => {
    return s3.createBucket({
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

export const listObjects = (s3) =>
  ({ bucket, prefix }) => {
    return s3.listObjects({
      Bucket: bucket,
      Prefix: prefix,
    });
  };
