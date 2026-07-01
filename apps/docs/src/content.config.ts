import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pageLayout: z.enum(['doc', 'guide', 'quickstart', 'reference', 'home']).default('doc'),
    sidebar: z
      .object({ label: z.string().optional(), order: z.number().optional(), hidden: z.boolean().default(false) })
      .default({}),
    related: z.array(z.string()).default([]),
    tableOfContents: z.boolean().default(true),
    draft: z.boolean().default(false),
  }),
});

export const collections = { docs };
