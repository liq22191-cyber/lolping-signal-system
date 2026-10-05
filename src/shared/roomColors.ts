/** Name tag colours, picked by index so a peer can never send raw CSS. All read well with the tag's dark outline. */
export const TAG_COLORS: readonly string[] = [
  '#4fc3f7', // sky
  '#ff8a65', // coral
  '#aed581', // lime
  '#ba68c8', // purple
  '#ffd54f', // amber
  '#4db6ac', // teal
  '#f06292', // pink
  '#e0e0e0', // silver
];

export const isTagColor = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < TAG_COLORS.length;
