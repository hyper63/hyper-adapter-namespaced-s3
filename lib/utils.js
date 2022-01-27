import { crocks, R } from "../deps.js";

const { Result, resultToAsync } = crocks;
const {
  includes,
  prop,
  cond,
  is,
  identity,
  T,
  complement,
  isNil,
  compose,
  join,
} = R;

const isDefined = complement(isNil);

export const mapErr = cond([
  // string
  [is(String), identity],
  // { message } catches both Error, and Object with message prop
  [
    compose(
      isDefined,
      prop("message"),
    ),
    prop("message"),
  ],
  // { msg }
  [
    compose(
      isDefined,
      prop("msg"),
    ),
    prop("msg"),
  ],
  // []
  [
    is(Array),
    compose(
      join(", "),
      (errs) => errs.map(mapErr), // recurse
    ),
  ],
  // any non nil
  [isDefined, (val) => JSON.stringify(val)],
  // nil
  [T, () => "An error occurred"],
]);

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
      ),
  );
};
