// lib/ids.mjs - stable ids for words and headings.
export const slug = (s) => s.toLowerCase().replace(/_+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
