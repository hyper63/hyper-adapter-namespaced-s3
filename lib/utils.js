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

export const mapErr = cond([
  [is(String), identity],
  [
    compose(
      complement(isNil),
      prop("message"),
    ), // catches both Error, and Object with message prop
    prop("message"),
  ],
  [
    is(Array),
    compose(
      join(", "),
      (errs) => errs.map(mapErr), // recurse
    ),
  ],
  [complement(isNil), (val) => JSON.stringify(val)],
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
