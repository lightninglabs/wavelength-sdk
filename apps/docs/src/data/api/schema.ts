import { z } from 'zod';

/** One documented proto field. Field names are snake_case as in the proto. */
export const fieldSchema = z.object({
  name: z.string(),
  /** Scalar name (e.g. "uint64") or the referenced message/enum name. */
  type: z.string(),
  repeated: z.boolean(),
  optional: z.boolean(),
  /** The containing oneof group name, or null. */
  oneof: z.string().nullable(),
  comment: z.string(),
});

export const messageSchema = z.object({
  name: z.string(),
  comment: z.string(),
  fields: z.array(fieldSchema),
});

export const enumValueSchema = z.object({
  name: z.string(),
  value: z.number(),
  comment: z.string(),
});

export const enumSchema = z.object({
  name: z.string(),
  comment: z.string(),
  values: z.array(enumValueSchema),
});

export const methodSchema = z.object({
  name: z.string(),
  /** Kebab-case URL slug, e.g. "prepare-send". */
  slug: z.string(),
  /** Owning service name, e.g. "WalletService". */
  service: z.string(),
  comment: z.string(),
  requestType: z.string(),
  responseType: z.string(),
  requestStream: z.boolean(),
  responseStream: z.boolean(),
  rest: z.object({ method: z.literal('POST'), path: z.string() }),
  /** Message/enum names reachable from request+response, excluding those two. */
  referencedTypes: z.array(z.string()),
});

export const apiDocSchema = z
  .object({
    /** Repo-relative proto path, for provenance display. */
    source: z.string(),
    package: z.string(),
    services: z.array(
      z.object({ name: z.string(), comment: z.string(), methods: z.array(z.string()) }),
    ),
    methods: z.array(methodSchema),
    messages: z.record(z.string(), messageSchema),
    enums: z.record(z.string(), enumSchema),
  })
  // The extractor guarantees every method's requestType/responseType/
  // referencedTypes name resolves into messages or enums, and that each
  // messages/enums map key matches its value's own name - but the shape
  // above only validates each field in isolation, not these cross-object
  // references. Consumers (e.g. ApiMethodLayout.astro) index into messages/
  // enums by these names and fall back to an empty field list on a miss, so
  // a violation here would otherwise surface as a silently blank page
  // instead of a build failure. Re-check the invariant here so a corrupted
  // or hand-edited wallet.json fails to parse instead.
  .refine(
    (doc) => {
      const typeNames = new Set([...Object.keys(doc.messages), ...Object.keys(doc.enums)]);
      const namesMatch =
        Object.entries(doc.messages).every(([key, m]) => key === m.name) &&
        Object.entries(doc.enums).every(([key, e]) => key === e.name);
      const referencesResolve = doc.methods.every(
        (m) =>
          typeNames.has(m.requestType) &&
          typeNames.has(m.responseType) &&
          m.referencedTypes.every((t) => typeNames.has(t)),
      );
      return namesMatch && referencesResolve;
    },
    {
      message:
        'apiDoc: messages/enums map keys must match their .name, and every ' +
        'requestType/responseType/referencedTypes entry must resolve into messages or enums',
    },
  );

export type ApiDoc = z.infer<typeof apiDocSchema>;
export type MethodDoc = z.infer<typeof methodSchema>;
export type MessageDoc = z.infer<typeof messageSchema>;
export type EnumDoc = z.infer<typeof enumSchema>;
export type FieldDoc = z.infer<typeof fieldSchema>;
