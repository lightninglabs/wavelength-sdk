// regtestEnabled gates the regtest network option behind an explicit query
// param (e.g. /?regtest=1) so the default experience shows only the hosted
// test networks. Read per call so tests that navigate with the param see it
// without a module reload.
export function regtestEnabled(): boolean {
  return new URLSearchParams(window.location.search).has("regtest");
}
