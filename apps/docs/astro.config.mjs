// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import expressiveCode from 'astro-expressive-code';
import mermaid from 'astro-mermaid';
import pagefind from 'astro-pagefind';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { mermaidThemeVariables } from './src/config/mermaid.ts';
import { mermaidFencePlugin } from './src/plugins/mermaid-fence.ts';

export default defineConfig({
  site: 'https://wavelength.lightning.engineering',
  markdown: {
    syntaxHighlight: {
      excludeLangs: ['mermaid', 'math'],
    },
    // Registered before the astro-mermaid integration appends its own
    // plugin, so mermaid fences in .mdx files are claimed here first;
    // astro-mermaid's raw-HTML transform only ever works for plain .md.
    processor: satteri({ mdastPlugins: [mermaidFencePlugin] }),
  },
  integrations: [
    // Must run before expressive-code so ```mermaid fences become diagrams,
    // not syntax-highlighted code blocks.
    mermaid({
      theme: 'base',
      autoTheme: false,
      enableLog: false,
      mermaidConfig: {
        themeVariables: mermaidThemeVariables,
        flowchart: {
          htmlLabels: false,
          curve: 'basis',
          padding: 20,
          nodeSpacing: 55,
          rankSpacing: 60,
          diagramPadding: 12,
          useMaxWidth: false,
        },
      },
    }),
    // Options live in ec.config.mjs (project root), not inline here: one of
    // them (themeCssSelector) is a function, and Expressive Code requires
    // its config to be JSON-serializable when passed to the integration
    // directly, since the runtime <Code> component also needs to load it.
    expressiveCode(),
    mdx(),
    react(),
    // Pagefind indexes the built dist/ at build time and serves the runtime at
    // /pagefind/pagefind.js. It only exists after `astro build`, not in dev.
    pagefind(),
    // Generates /sitemap-index.xml and /sitemap-0.xml at build time.
    sitemap(),
  ],
});
