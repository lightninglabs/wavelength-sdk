import raw from './wallet.json' with { type: 'json' };
import { apiDocSchema, type ApiDoc, type MethodDoc } from './schema';

/** The committed, validated API reference document (see scripts/gen-api-docs.mts). */
export const apiDoc: ApiDoc = apiDocSchema.parse(raw);

/** Looks up a method by its URL slug (e.g. "prepare-send"). */
export function methodBySlug(slug: string): MethodDoc | undefined {
  return apiDoc.methods.find((m) => m.slug === slug);
}
