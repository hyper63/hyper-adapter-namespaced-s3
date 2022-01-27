export * as R from "https://cdn.skypack.dev/ramda@^0.28.0";
export { default as crocks } from "https://cdn.skypack.dev/crocks@^0.12.4";

export {
  ApiFactory,
  AwsEndpointResolver,
} from "https://deno.land/x/aws_api@v0.6.0/client/mod.ts";
// Use my fork until https://github.com/cloudydeno/deno-aws_api/pull/27 is merged
export { S3 } from "https://raw.githubusercontent.com/TillaTheHun0/deno-aws_api/fix/s3-delete-objects-missing-header/lib/services/s3/mod.ts";
export { readAll } from "https://deno.land/std@0.122.0/streams/conversion.ts";
export { Buffer } from "https://deno.land/std@0.122.0/io/buffer.ts";
export { crypto } from "https://deno.land/std@0.122.0/crypto/mod.ts";
export { join } from "https://deno.land/std@0.122.0/path/mod.ts";
