import { getCollection } from "astro:content";
import type { Section } from "./site";
export const published = async (section: Exclude<Section, "about">) =>
  (await getCollection(section)).filter(entry => entry.data.status === "published")
    .sort((a,b) => b.data.date.localeCompare(a.data.date) || a.id.localeCompare(b.id));
