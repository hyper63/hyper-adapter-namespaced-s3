export * as R from 'https://cdn.skypack.dev/ramda@0.28.0'
export { default as crocks } from 'https://cdn.skypack.dev/crocks@0.12.4'

export {
  ApiFactory,
  AwsEndpointResolver,
  DefaultCredentialsProvider,
} from 'https://deno.land/x/aws_api@v0.7.0/client/mod.ts'
export { S3 } from 'https://deno.land/x/aws_api@v0.7.0/services/s3/mod.ts'

export { readAll } from 'https://deno.land/std@0.178.0/streams/read_all.ts'
export { Buffer } from 'https://deno.land/std@0.178.0/io/buffer.ts'
export { join } from 'https://deno.land/std@0.178.0/path/mod.ts'

export { HyperErr, isHyperErr } from 'https://x.nest.land/hyper-utils@0.1.0/hyper-err.js'
