/** The physical film on the roll. */
export const FILM_WIDTH_IN = 24

/**
 * Printable width across that film. Sized so two 10.75 in designs still fit
 * side by side with a 2.5 mm cut box and 5 mm crop marks at both edges; the
 * rest of the roll is the edge the printer cannot reach.
 */
export const SHEET_WIDTH_IN = 22.3

/** Unprintable film either side of the printable width. */
export const FILM_EDGE_IN = (FILM_WIDTH_IN - SHEET_WIDTH_IN) / 2
