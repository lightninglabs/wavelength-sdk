/**
 * Render-time code sample generators for the API reference pages. Samples
 * are generated from the committed method data plus curated sample values,
 * never baked into wallet.json, so sample style can evolve without
 * regenerating data.
 *
 * When the daemon's gRPC listener gains TLS by default, three places need to
 * change in lockstep: the plaintext callout on
 * apps/docs/src/content/docs/api/get-started.mdx, the insecure credentials
 * used by goGrpcSample/pythonGrpcSample/jsGrpcSample below, and the --no-tls
 * framing on the CLI index page (apps/docs/src/content/docs/cli.mdx).
 */
import type { MethodDoc } from './schema';
import { apiDoc } from './index';
import { API_CLI_INVOCATION, API_SAMPLES } from '../../config/api';

/** Default daemon gRPC endpoint (waved DefaultRPCHost). */
export const GRPC_HOST = 'localhost:10029';
/** Default daemon REST gateway (waved DefaultRPCGatewayHost). */
export const REST_BASE = 'http://localhost:10031';

function body(method: MethodDoc): Record<string, unknown> {
  return API_SAMPLES[method.name] ?? {};
}

function jsonBody(method: MethodDoc, indent: string): string {
  const json = JSON.stringify(body(method), null, 2);
  return json.split('\n').join(`\n${indent}`);
}

/** The wavecli invocation for this RPC, or null when no command maps. */
export function cliSample(method: MethodDoc): string | null {
  return API_CLI_INVOCATION[method.name] ?? null;
}

/**
 * Wraps a string in single quotes for a POSIX shell command line, escaping
 * any embedded single quotes (close the quote, emit an escaped quote, reopen
 * the quote) so the resulting line always stays syntactically valid, even if
 * a future sample value contains an apostrophe.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function curlSample(method: MethodDoc): string {
  return [
    `curl -X POST ${REST_BASE}${method.rest.path} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d ${shellQuote(JSON.stringify(body(method)))}`,
  ].join('\n');
}

export function jsRestSample(method: MethodDoc): string {
  if (method.responseStream) {
    return [
      `const res = await fetch('${REST_BASE}${method.rest.path}', {`,
      `  method: 'POST',`,
      `  headers: { 'Content-Type': 'application/json' },`,
      `  body: JSON.stringify(${jsonBody(method, '  ')}),`,
      `});`,
      ``,
      `// The gateway streams newline-delimited JSON objects.`,
      `const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();`,
      `for (;;) {`,
      `  const { value, done } = await reader.read();`,
      `  if (done) break;`,
      `  for (const line of value.split('\\n').filter(Boolean)) {`,
      `    console.log(JSON.parse(line));`,
      `  }`,
      `}`,
    ].join('\n');
  }
  return [
    `const res = await fetch('${REST_BASE}${method.rest.path}', {`,
    `  method: 'POST',`,
    `  headers: { 'Content-Type': 'application/json' },`,
    `  body: JSON.stringify(${jsonBody(method, '  ')}),`,
    `});`,
    `const ${lowerFirst(method.responseType)} = await res.json();`,
  ].join('\n');
}

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Converts a proto snake_case field name to its protoc-gen-go struct field
 * name: each underscore-separated segment capitalized and joined.
 * protoc-gen-go does this plain capitalization; it does not apply Go's
 * ID/URL initialism convention (a field named send_intent_id becomes
 * SendIntentId, not SendIntentID).
 */
function goFieldName(snake: string): string {
  return snake
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** The declared proto type name for one field of a method's request message. */
function requestFieldType(method: MethodDoc, fieldName: string): string | undefined {
  return apiDoc.messages[method.requestType]?.fields.find(
    (f) => f.name === fieldName,
  )?.type;
}

/**
 * Renders a curated sample value as a Go literal for a request struct field.
 * Enum-typed fields render as the generated Go identifier (Type_VALUE)
 * instead of their JSON string form, since a proto enum field cannot be
 * assigned a string literal. Covers the value shapes that appear in
 * API_SAMPLES: strings, enum strings, numbers, booleans, and string arrays.
 */
function goValue(value: unknown, protoType?: string): string {
  if (typeof value === 'string') {
    if (protoType && apiDoc.enums[protoType]) {
      return `wavewalletrpc.${protoType}_${value}`;
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[]string{${value.map((v) => goValue(v)).join(', ')}}`;
  }
  throw new Error(`goValue: unsupported sample value ${JSON.stringify(value)}`);
}

/**
 * Renders a curated sample value as a Python literal for a request kwarg.
 * Enum-typed fields render as the generated module-level constant (proto3
 * top-level enum values compile to wallet_pb2.VALUE) instead of their JSON
 * string form.
 */
function pythonValue(value: unknown, protoType?: string): string {
  if (typeof value === 'string') {
    if (protoType && apiDoc.enums[protoType]) {
      return `wallet_pb2.${value}`;
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => pythonValue(v)).join(', ')}]`;
  }
  throw new Error(`pythonValue: unsupported sample value ${JSON.stringify(value)}`);
}

export function goGrpcSample(method: MethodDoc): string {
  const fields = Object.entries(body(method)).map(
    ([key, value]) =>
      `\t${goFieldName(key)}: ${goValue(value, requestFieldType(method, key))},`,
  );
  const requestLines =
    fields.length > 0
      ? [`req := &wavewalletrpc.${method.requestType}{`, ...fields, `}`]
      : [`req := &wavewalletrpc.${method.requestType}{}`];

  const call = method.responseStream
    ? [
        `stream, err := client.${method.name}(ctx, req)`,
        `if err != nil {`,
        `\tlog.Fatal(err)`,
        `}`,
        `for {`,
        `\tupdate, err := stream.Recv()`,
        `\tif err != nil {`,
        `\t\tbreak`,
        `\t}`,
        `\tfmt.Println(update)`,
        `}`,
      ]
    : [
        `resp, err := client.${method.name}(ctx, req)`,
        `if err != nil {`,
        `\tlog.Fatal(err)`,
        `}`,
        `fmt.Println(resp)`,
      ];
  return [
    `conn, err := grpc.NewClient("${GRPC_HOST}",`,
    `\tgrpc.WithTransportCredentials(insecure.NewCredentials()))`,
    `if err != nil {`,
    `\tlog.Fatal(err)`,
    `}`,
    `defer conn.Close()`,
    ``,
    `client := wavewalletrpc.New${method.service}Client(conn)`,
    `ctx := context.Background()`,
    ...requestLines,
    ...call,
  ].join('\n');
}

export function pythonGrpcSample(method: MethodDoc): string {
  const kwargs = Object.entries(body(method)).map(
    ([key, value]) => `    ${key}=${pythonValue(value, requestFieldType(method, key))},`,
  );
  const requestLines =
    kwargs.length > 0
      ? [`request = wallet_pb2.${method.requestType}(`, ...kwargs, `)`]
      : [`request = wallet_pb2.${method.requestType}()`];

  const call = method.responseStream
    ? [
        `for update in stub.${method.name}(request):`,
        `    print(update)`,
      ]
    : [
        `response = stub.${method.name}(request)`,
        `print(response)`,
      ];
  return [
    `import grpc`,
    `import wallet_pb2`,
    `import wallet_pb2_grpc`,
    ``,
    `channel = grpc.insecure_channel('${GRPC_HOST}')`,
    `stub = wallet_pb2_grpc.${method.service}Stub(channel)`,
    ``,
    ...requestLines,
    ...call,
  ].join('\n');
}

export function jsGrpcSample(method: MethodDoc): string {
  const call = method.responseStream
    ? [
        `// Calls wavewalletrpc.${method.service}.${method.name}.`,
        `const stream = client.${lowerFirst(method.name)}(request);`,
        `stream.on('data', (update) => console.log(update));`,
        `stream.on('end', () => console.log('stream closed'));`,
      ]
    : [
        `// Calls wavewalletrpc.${method.service}.${method.name}.`,
        `client.${lowerFirst(method.name)}(request, (err, response) => {`,
        `  if (err) throw err;`,
        `  console.log(response);`,
        `});`,
      ];
  return [
    `const grpc = require('@grpc/grpc-js');`,
    `const protoLoader = require('@grpc/proto-loader');`,
    ``,
    `const packageDefinition = protoLoader.loadSync('wallet.proto');`,
    `const { wavewalletrpc } = grpc.loadPackageDefinition(packageDefinition);`,
    `const client = new wavewalletrpc.${method.service}(`,
    `  '${GRPC_HOST}',`,
    `  grpc.credentials.createInsecure(),`,
    `);`,
    ``,
    `const request = ${JSON.stringify(body(method), null, 2)};`,
    ...call,
  ].join('\n');
}
