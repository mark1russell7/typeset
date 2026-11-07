/**
 * The browser of each width arm comes from the resolved version of `playwright-core` in `pnpm-lock.yaml`. A bump of that
 * version changes the reference of each arm, and it changes no source file. This module finds that change. It has no
 * dependency, so the job `changes` of the Fonts workflow starts it with no install.
 */

/** This function gives the resolved versions of `playwright` and `playwright-core` in a pnpm lock file, as sorted `name@version` keys. */
export function browserVersions(lock: string): string[] {
  const found = new Set<string>();
  for (const match of lock.matchAll(/^ {2}'?(playwright(?:-core)?)@(\d[^:(\s']*)'?:/gm)) found.add(`${match[1]}@${match[2]}`);
  return [...found].sort();
}

/** This function tells if the browser packages of two lock files differ. */
export function browserChanged(base: string, head: string): boolean {
  return browserVersions(base).join(" ") !== browserVersions(head).join(" ");
}
