import { ApiFactory, AwsEndpointResolver, crocks, R, S3 } from "./deps.js";

import createAdapter from "./adapter.js";
import PORT_NAME from "./port_name.js";

const { Either } = crocks;
const { Left, Right, of } = Either;
const {
  __,
  assoc,
  identity,
  mergeRight,
  isNil,
  reject,
  over,
  lensProp,
  defaultTo,
} = R;

export default (
  bucketPrefix,
  { awsAccessKeyId, awsSecretKey, region } = {},
) => {
  const setPrefixOn = (obj) => assoc("prefix", __, obj); // expects object
  const setAwsCreds = (env) =>
    mergeRight(
      env,
      reject(isNil, {
        awsAccessKeyId,
        awsSecretKey,
        region,
      }),
    );
  const setAwsRegion = (env) =>
    mergeRight(
      { region: "us-east-1" },
      env,
    );
  const createFactory = (env) =>
    over(
      lensProp("factory"),
      () =>
        (env.awsAccessKeyId && env.awsSecretKey && env.region)
          /**
           * Disable using Dualstack endpoints, so this adapter will use VPC Gateway endpoint when used within a VPC
           * - For lib api, see https://github.com/cloudydeno/deno-aws_api/blob/3afef9fe3aaef842fd3a19245593494c3705a1dd/lib/client/endpoints.ts#L19
           * - For Dualstack description https://docs.aws.amazon.com/AmazonS3/latest/userguide/dual-stack-endpoints.html#dual-stack-endpoints-description
           */
          ? new ApiFactory({
            credentials: env,
            endpointResolver: new AwsEndpointResolver({ useDualstack: false }),
          })
          : /**
           * ApiFactory attempts to pull credentials from multiple environment places
           * If not provided via constructor
           * See https://github.com/cloudydeno/deno-aws_api/blob/2b8605516802c1b790a2b112c03b790feb3bf58f/lib/client/credentials.ts#L50
           */
            new ApiFactory({
              endpointResolver: new AwsEndpointResolver({
                useDualstack: false,
              }),
            }),
      env,
    );
  const setAws = (env) =>
    over(
      lensProp("aws"),
      () => ({ factory: env.factory, s3: new S3(env.factory) }),
      env,
    );

  return Object.freeze({
    id: "s3",
    port: PORT_NAME,
    load: (prevLoad) =>
      of(prevLoad) // credentials can be received from a composed plugin
        .map(defaultTo({}))
        .map(setAwsCreds)
        .map(setAwsRegion)
        .chain((env) =>
          notIsNil(bucketPrefix)
            .map(setPrefixOn(env))
        )
        .map(createFactory)
        .map(setAws)
        .either(
          (e) => console.log("Error: In Load Method", e.message),
          identity,
        ),
    link: ({ prefix, aws }) => (_) => createAdapter(prefix, aws),
  });
};

function notIsNil(s) {
  return isNil(s)
    ? Left({ message: "S3 Prefix Name: can not be null or undefined!" })
    : Right(s);
}
