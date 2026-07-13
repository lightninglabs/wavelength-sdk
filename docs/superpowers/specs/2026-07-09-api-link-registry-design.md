# API Link Registry Design

## Goal

Make links to documented SDK symbols consistent and discoverable without turning every identifier in the docs into a link.

## Design

- Add one typed registry under `apps/docs/src/config/` mapping documented symbol names to reference-page paths and anchors.
- Add an `ApiLink` MDX component for deliberate prose links. It renders an inline code label by default, supports an optional label, and uses the registry to resolve the destination.
- Update `ParamsTable` and `Returns` to resolve named symbol types through the registry. Primitive types, unions, function types, and unknown labels remain plain code.
- Use same-page anchors for symbols on the current reference page when supplied by the caller; otherwise use the registry route.
- Add curated first-mention links to reference introductions and the web/RN quickstarts and guides for core factories, hooks, data types, and error types. Repeated mentions and code fences remain unchanged.

## Visual and accessibility rules

- Keep the existing type badge shape and accent color.
- Add a restrained dashed underline to linked table/return badges, with a stronger hover and `:focus-visible` state.
- Give prose API links the existing prose link color, plus a subtle underline on hover/focus. Do not add icons or extra pills.
- Preserve visible link text and keyboard focus behavior in both light and dark themes.

## Testing

- Unit-test registry resolution for local and cross-page symbols and for unknown/compound types.
- Add a docs Playwright assertion that representative reference pages contain links for `WalletEngineOptions`, `WalletEngine`, and `WalletDKClient` in table/return contexts.
- Build and typecheck the docs app, then run the relevant docs tests.
