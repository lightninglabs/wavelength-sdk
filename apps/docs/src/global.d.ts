/**
 * Ambient type augmentations for Wavelength docs.
 * Declares window globals used in inline scripts so TypeScript does not
 * report them as unknown properties.
 */

declare global {
  interface Window {
    /** Set to true once the global Cmd/Ctrl-K search listener is registered.
     * Prevents stacking the listener across inline-script re-executions. */
    __wdkSearchKeyBound?: boolean;
    /** Set to true once the astro:after-swap theme listener is registered.
     * Prevents stacking the listener across inline-script re-executions. */
    __wdkThemeBound?: boolean;
    /** Set to true once the sidebar scroll-restore listeners are registered.
     * Prevents stacking the listeners across inline-script re-executions. */
    __wdkSidebarScrollBound?: boolean;
    /** Set by a search trigger to request the modal open. Lets the modal island
     * honor a request dispatched before it hydrated (the event is dropped, the
     * flag survives). The island clears it once consumed. */
    __wdkSearchWantsOpen?: boolean;
  }
}

export {};
