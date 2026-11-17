import layout from "./home.json";
import type { Section } from "./site";
export const home = layout as { section: Exclude<Section, "about">; ids?: string[]; hidden?: boolean }[];
