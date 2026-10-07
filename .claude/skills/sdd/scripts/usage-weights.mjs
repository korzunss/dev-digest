// F1 metric: input-equivalent "weighted tokens" (close to cost ratios; a raw sum
// would mostly track cache reads). One constant, printed in every F1 line.
export const W = { input: 1, cache_creation: 1.25, cache_read: 0.1, output: 5 };
export const METRIC = 'weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output';
// usage numbers come from a file: non-finite or negative values count as 0
export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export const weighted = (r) =>
  W.input * num(r.input) +
  W.cache_creation * num(r.cache_creation) +
  W.cache_read * num(r.cache_read) +
  W.output * num(r.output);
