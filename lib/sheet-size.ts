/** The physical film on the roll. */
export const FILM_WIDTH_IN = 24

/**
 * Printable width across that film, measured off a hand-built sheet that
 * prints and cuts correctly. Artwork, crop marks and cut boxes all live
 * inside this; the rest of the roll is the edge the printer cannot reach.
 */
export const SHEET_WIDTH_IN = 21.93

/** Unprintable film either side of the printable width. */
export const FILM_EDGE_IN = (FILM_WIDTH_IN - SHEET_WIDTH_IN) / 2
