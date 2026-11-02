/**
 * A case of the bench. In each process, the harness uses `setup` one time, and then uses `run` many times.
 * The harness times only `run`.
 */
export interface BenchCase<State = unknown> {
  setup(): State;
  /** This function does the work that the bench times. Its result goes to a sink, so the engine cannot remove the work. */
  run(state: State): unknown;
}

/** A module of cases exports this record. The key is the name of the case, for example `corpus.generate`. */
export type CaseModule = Readonly<Record<string, BenchCase<unknown>>>;

/** This function gives a case its type. It does nothing at run time. */
export function defineCase<State>(benchCase: BenchCase<State>): BenchCase<State> {
  return benchCase;
}
