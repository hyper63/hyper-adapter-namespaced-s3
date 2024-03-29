export * as R from 'https://cdn.skypack.dev/ramda@0.28.0'
export { default as crocks } from 'https://cdn.skypack.dev/crocks@0.12.4'

export {
  ApiFactory,
  AwsEndpointResolver,
  DefaultCredentialsProvider,
} from 'https://deno.land/x/aws_api@v0.7.0/client/mod.ts'
export { S3 } from 'https://deno.land/x/aws_api@v0.8.1/services/s3/mod.ts'
export { managedUpload } from 'https://deno.land/x/aws_api@v0.8.1/extras/s3-upload.ts'

export { join } from 'https://deno.land/std@0.187.0/path/mod.ts'

export {
  HyperErr,
  isHyperErr,
} from 'https://raw.githubusercontent.com/hyper63/hyper/hyper-utils%40v0.1.0/packages/utils/hyper-err.js'
