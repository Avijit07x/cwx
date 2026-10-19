export function memoizeLast<Args extends readonly unknown[], Result>(
  fn: (...args: Args) => Result,
  sameResult: (previous: Result, next: Result) => boolean = () => false,
): (...args: Args) => Result {
  let cache: { readonly args: Args; readonly result: Result } | null = null;
  return (...args: Args) => {
    if (
      cache?.args.length === args.length &&
      cache.args.every((arg, index) => Object.is(arg, args[index]))
    ) {
      return cache.result;
    }
    const next = fn(...args);
    const result = cache && sameResult(cache.result, next) ? cache.result : next;
    cache = { args, result };
    return result;
  };
}
