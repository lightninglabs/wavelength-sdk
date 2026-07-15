---
name: wavelength-api
description: Integrate against the Wavelength wallet daemon (waved) over its gRPC or REST API. Use when calling WalletService RPCs, building a backend or non-browser integration, connecting to waved, or mapping REST routes under /v1/wallet/. Triggers include "waved", "WalletService", "wavelength grpc", "wavelength rest api", and "wallet daemon api".
---

# Wavelength daemon API integration

The wallet daemon `waved` exposes WalletService over gRPC with a matching
REST gateway. This is the remote integration surface for backends and
non-browser clients; app developers embedding a wallet in a web page should
use the SDK instead (see the wavelength-web skill).

Docs index: https://wavelength.lightning.engineering/llms.txt. The API slice
lists one page per RPC; every page has a markdown twin at `.md`.

## Start here

- Running waved, connection, TLS, and auth:
  https://wavelength.lightning.engineering/api/get-started.md
- REST conventions (routes, verbs, error shape):
  https://wavelength.lightning.engineering/api/rest.md
- The full RPC list with request and response fields is in the API section
  of llms.txt; fetch the page for the RPC you are calling.

## Critical rules

- Choose the surface deliberately: gRPC for streaming and typed clients,
  REST for simple request and response calls. Every RPC page shows both.
- Read the request and response field tables from the RPC page instead of
  guessing field names from other Lightning implementations; this daemon is
  not lnd and shares no proto surface with it.
- Use the documented error shape for REST failures rather than assuming
  bare HTTP status semantics.
- Amounts are satoshi-denominated integers unless a field's table says
  otherwise; never infer millisatoshis.
