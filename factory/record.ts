// Run records and issue comments are public. Pure: no I/O.

/** The text with every occurrence of the home folder replaced by `~`. */
export function withoutHome(text: string, home: string): string {
  return home.length > 1 ? text.split(home).join('~') : text;
}
