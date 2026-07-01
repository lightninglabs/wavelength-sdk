export {};

declare global {
  interface Window {
    __wdkNoReload?: boolean;
  }
}
