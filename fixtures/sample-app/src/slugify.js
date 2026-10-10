// ATLAS-SAMPLE: intentionally buggy. Spaces become dashes, but case, punctuation and
// repeated separators are not handled.
export function slugify(title) {
  return title.trim().replace(/ /g, '-');
}
