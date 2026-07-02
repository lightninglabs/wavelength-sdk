// @ts-check
// Expressive Code options that include function values (themeCssSelector
// below) cannot live inline in astro.config.mjs: they must be JSON
// serializable there, since both the build-time integration and the
// runtime <Code> component (used by src/components/api/CodeTabs.astro)
// need to load the same config independently. Expressive Code auto-detects
// this file at the project root.

/** @type {import('astro-expressive-code').AstroExpressiveCodeOptions} */
export default {
  themes: ['vitesse-dark', 'vitesse-light'],
  // Expressive Code's default theme selector keys off the literal theme
  // name, e.g. [data-theme='vitesse-light']. The site's own light/dark
  // toggle sets data-theme to the generic 'dark' / 'light' values
  // (BaseLayout.astro, ThemeToggle.tsx), which never matches that
  // selector, so every code block silently rendered in vitesse-dark
  // regardless of site theme. Key off each theme's built-in `type`
  // ('dark' | 'light') instead, which already matches the site's
  // attribute values exactly.
  themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
  styleOverrides: {
    borderRadius: '0.5rem',
    codeFontFamily: "'JetBrains Mono', ui-monospace, monospace",
    // Shiki themes set their own code background (vitesse-light's is pure
    // white, identical to the site's --bg), so the code body blended into
    // the surrounding page with only the frame header to break it up.
    // --surface is a step darker than --bg in both themes, giving the code
    // body a background visibly distinct from the page.
    codeBackground: 'var(--surface)',
    // Frame headers (the filename bar above titled code blocks, and the
    // terminal titlebar above shell blocks) use the site's surface and
    // border tokens instead of the Shiki theme's editor chrome colors,
    // so they match the `.rail-code-header-guide` look from the design
    // mockup (design-mockups/r4-final/styles.css `.rail-code-header`)
    // in both the dark and light site themes.
    //
    // The header background is --surface-3, not --surface-2: in light mode
    // --surface-2 is pure white, identical to vitesse-light's own code
    // background, so the header and code body were indistinguishable and
    // the border below the header was nearly invisible against two white
    // surfaces. --surface-3 (and the stronger --border-2 below) give a
    // header that reads as a visibly distinct bar in both themes.
    frames: {
      frameBoxShadowCssValue: 'none',
      // Terminal frames read their code background from
      // frames.terminalBackground (defaults to the Shiki theme's own
      // "terminal.background", not the top-level codeBackground override
      // above) so it needs its own override to match.
      terminalBackground: 'var(--surface)',
      // Editor frame (titled code, e.g. ```ts title="App.tsx"`).
      editorTabBarBackground: 'var(--surface-3)',
      editorTabBarBorderColor: 'var(--border)',
      editorTabBarBorderBottomColor: 'var(--border-2)',
      editorActiveTabBackground: 'var(--surface-3)',
      editorActiveTabForeground: 'var(--text-muted)',
      editorActiveTabBorderColor: 'transparent',
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabIndicatorBottomColor: 'transparent',
      // Terminal frame (bash/sh blocks render as a terminal window).
      terminalTitlebarBackground: 'var(--surface-3)',
      terminalTitlebarForeground: 'var(--text-muted)',
      terminalTitlebarBorderBottomColor: 'var(--border-2)',
      terminalTitlebarDotsForeground: 'var(--text-dim)',
    },
  },
};
