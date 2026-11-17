import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
const photo = z.object({src: z.string(), alt: z.string(), caption: z.string().optional()});
const entry = z.object({
  title: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  archive: z.string(),
  status: z.enum(["published", "draft"]),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  cover: photo.optional(),
  photos: z.array(photo).default([]),
  category: z.enum(["CINEMA", "MUSIC", "READING"]).optional(),
  details: z.string().optional(),
});
const collection = (name: string) => defineCollection({
  loader: glob({base: `./src/content/${name}`, pattern: "**/*.md"}), schema: entry,
});
export const collections = {
  journal: collection("journal"), notes: collection("notes"),
  culture: collection("culture"), photography: collection("photography"),
};
