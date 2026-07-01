// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import expressiveCode from 'astro-expressive-code';
import pagefind from 'astro-pagefind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://docs.walletdk.dev',
  integrations: [
    expressiveCode({
      themes: ['vitesse-dark', 'vitesse-light'],
      styleOverrides: {
        borderRadius: '0.5rem',
        codeFontFamily: "'JetBrains Mono', ui-monospace, monospace",
        // Frame headers (the filename bar above titled code blocks, and the
        // terminal titlebar above shell blocks) use the site's surface and
        // border tokens instead of the Shiki theme's editor chrome colors,
        // so they match the `.rail-code-header-guide` look from the design
        // mockup (design-mockups/r4-final/styles.css `.rail-code-header`)
        // in both the dark and light site themes.
        frames: {
          frameBoxShadowCssValue: 'none',
          // Editor frame (titled code, e.g. ```ts title="App.tsx"`).
          editorTabBarBackground: 'var(--surface-2)',
          editorTabBarBorderColor: 'var(--border)',
          editorTabBarBorderBottomColor: 'var(--border)',
          editorActiveTabBackground: 'var(--surface-2)',
          editorActiveTabForeground: 'var(--text-muted)',
          editorActiveTabBorderColor: 'transparent',
          editorActiveTabIndicatorTopColor: 'transparent',
          editorActiveTabIndicatorBottomColor: 'transparent',
          // Terminal frame (bash/sh blocks render as a terminal window).
          terminalTitlebarBackground: 'var(--surface-2)',
          terminalTitlebarForeground: 'var(--text-muted)',
          terminalTitlebarBorderBottomColor: 'var(--border)',
          terminalTitlebarDotsForeground: 'var(--text-dim)',
        },
      },
    }),
    mdx(),
    react(),
    // Pagefind indexes the built dist/ at build time and serves the runtime at
    // /pagefind/pagefind.js. It only exists after `astro build`, not in dev.
    pagefind(),
    // Generates /sitemap-index.xml and /sitemap-0.xml at build time.
    sitemap(),
  ],
});
