import { crocks, HyperErr, isHyperErr, R } from '../deps.js'

const { Async, Result, resultToAsync } = crocks
const { includes, ifElse, identity, find, __, propSatisfies, allPass, has } = R

export const tokenErrs = [
  'InvalidAccessKeyId',
  'InvalidToken',
  'ExpiredToken',
  'SignatureDoesNotMatch',
  'Http400',
]

export const isAwsTokenErr = allPass([
  has('message'),
  propSatisfies(
    (s) => find(includes(__, s), tokenErrs),
    'message',
  ),
])

export const handleHyperErr = ifElse(
  isHyperErr,
  Async.Resolved,
  Async.Rejected,
)

export const checkName = (name) => {
  return resultToAsync(
    Result.Err([])
      .alt(
        includes('..', name) ? Result.Err(['name cannot contain \'..\'']) : Result.Err([]),
      )
      .bichain(
        (errs) => errs.length ? Result.Err(errs) : Result.Ok(name),
        Result.Ok,
      )
      .bimap(
        (errs) => HyperErr(errs.join(', ')), // combine errs into string
        identity,
      ),
  )
}
