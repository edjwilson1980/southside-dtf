/** The physical film on the roll. */
export const FILM_WIDTH_IN = 24

/**
 * Printable width across that film. Artwork, crop marks and cut boxes all
 * live inside this; the rest of the roll is the unprintable edge the printer
 * cannot reach.
 */
export const SHEET_WIDTH_IN = 21.75

/** Unprintable film either side of the printable width. */
export const FILM_EDGE_IN = (FILM_WIDTH_IN - SHEET_WIDTH_IN) / 2
