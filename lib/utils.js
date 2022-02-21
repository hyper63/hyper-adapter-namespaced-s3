import { crocks, R } from "../deps.js";

const { Async, Result, resultToAsync } = crocks;
const {
  __,
  assoc,
  includes,
  isEmpty,
  ifElse,
  defaultTo,
  prop,
  cond,
  is,
  identity,
  T,
  complement,
  isNil,
  compose,
  has,
  allPass,
  anyPass,
  filter,
} = R;

const isDefined = complement(isNil);
const isEmptyObject = allPass([
  complement(is(Array)), // not an array
  is(Object),
  isEmpty,
]);
const rejectNil = filter(isDefined);

/**
 * Constructs a hyper-esque error
 *
 * @typedef {Object} HyperErrArgs
 * @property {string} msg
 * @property {string?} status
 *
 * @typedef {Object} NotOk
 * @property {false} ok
 *
 * @param {(HyperErrArgs | string)} argsOrMsg
 * @returns {NotOk & HyperErrArgs} - the hyper-esque error
 */
export const HyperErr = (argsOrMsg) =>
  compose(
    ({ ok, msg, status }) => rejectNil({ ok, msg, status }), // pick and filter nil
    assoc("ok", false),
    cond([
      [is(String), assoc("msg", __, {})],
      [
        anyPass([
          isEmptyObject,
          has("msg"),
          has("status"),
        ]),
        identity,
      ],
      [T, () => {
        throw new Error(
          "HyperErr args must be a string or an object with msg or status",
        );
      }],
    ]),
    defaultTo({}),
  )(argsOrMsg);

export const isHyperErr = allPass([
  has("ok"), // { ok }
  complement(prop("ok")), // { ok: false }
]);

export const handleHyperErr = ifElse(
  isHyperErr,
  Async.Resolved,
  Async.Rejected,
);

export const checkName = (name) => {
  return resultToAsync(
    Result.Err([])
      .alt(
        includes("..", name)
          ? Result.Err(["name cannot contain '..'"])
          : Result.Err([]),
      )
      .bichain(
        (errs) => errs.length ? Result.Err(errs) : Result.Ok(name),
        Result.Ok,
      )
      .bimap(
        (errs) => HyperErr(errs.join(", ")), // combine errs into string
        identity,
      ),
  );
};
