import {
  ApiFactory,
  AwsEndpointResolver,
  crocks,
  DefaultCredentialsProvider,
  R,
  S3,
} from "./deps.js";

import createAdapter from "./adapter.js";
import PORT_NAME from "./port_name.js";
import { getSignedUrl } from "./lib/getSignedUrl.ts";

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
  if (!bucketPrefix || bucketPrefix.length > 32) {
    throw new Error("bucketPrefix must a string 1-32 alphanumeric characters");
  }

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

  const createCredentialProvider = (env) =>
    over(
      lensProp("credentialProvider"),
      /**
       * Either use provided credentials or use the DefaultCredentialsProvider
       * from AWS deno sdk, merging in this adapters defualt region
       */
      () =>
        (env.awsAccessKeyId && env.awsSecretKey && env.region)
          ? { getCredentials: () => Promise.resolve(env) }
          : {
            ...DefaultCredentialsProvider,
            getCredentials: () =>
              DefaultCredentialsProvider.getCredentials()
                .then(setAwsRegion),
          },
      env,
    );

  const createFactory = (env) =>
    over(
      lensProp("factory"),
      /**
       * Disable using Dualstack endpoints, so this adapter will use VPC Gateway endpoint when used within a VPC
       * - For lib api, see https://github.com/cloudydeno/deno-aws_api/blob/3afef9fe3aaef842fd3a19245593494c3705a1dd/lib/client/endpoints.ts#L19
       * - For Dualstack description https://docs.aws.amazon.com/AmazonS3/latest/userguide/dual-stack-endpoints.html#dual-stack-endpoints-description
       */
      () =>
        new ApiFactory({
          credentialProvider: env.credentialProvider,
          endpointResolver: new AwsEndpointResolver({ useDualstack: false }),
        }),
      env,
    );

  const setAws = (env) =>
    over(
      lensProp("aws"),
      () => ({
        factory: env.factory,
        credentialProvider: env.credentialProvider,
        s3: new S3(env.factory),
        getSignedUrl,
      }),
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
        .map(createCredentialProvider)
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
