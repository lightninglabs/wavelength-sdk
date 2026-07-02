// extract.mts parses the wallet daemon's proto source plus its grpc-gateway
// route config into the JSON document apps/docs renders the API reference
// from. Pure functions only; all file I/O lives in scripts/gen-api-docs.mts
// so tests can feed fixture strings directly.

import protobuf from 'protobufjs';
import { parse as parseYaml } from 'yaml';
import type {
  ApiDoc, MessageDoc, EnumDoc, MethodDoc,
} from '../../apps/docs/src/data/api/schema.ts';

export interface RestRule {
  selector: string;
  method: 'POST';
  path: string;
}

/** Converts a PascalCase RPC name to its kebab-case URL slug. */
export function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Normalizes upstream comment text for this repo. The daemon repo's proto
 * comments may contain em-dash (U+2014) characters; this repo bans that
 * character everywhere, generated JSON included, so the extractor maps each
 * occurrence to an ASCII hyphen at the boundary instead of mutating the
 * upstream source.
 */
function sanitizeComment(text: string): string {
  return text.replace(/\u2014/g, '-');
}

/** Parses the grpc-gateway yaml config into a flat list of REST rules. */
export function parseRestRules(yamlText: string): RestRule[] {
  const doc = parseYaml(yamlText) as {
    http?: { rules?: { selector?: string; post?: string }[] };
  };
  const rules = doc.http?.rules ?? [];
  return rules.map((rule) => {
    if (!rule.selector || !rule.post) {
      throw new Error(
        `gateway rule ${JSON.stringify(rule)} is not a POST rule with a selector`,
      );
    }
    return { selector: rule.selector, method: 'POST' as const, path: rule.post };
  });
}

/**
 * Extracts services, methods, messages, and enums (with their doc comments)
 * from proto source, joined with the REST routes from the gateway config.
 * Throws with a full list of problems when any method lacks a route or any
 * service, method, or field lacks a doc comment.
 */
export function extractApiDoc(
  protoSource: string,
  yamlText: string,
  sourcePath: string,
): ApiDoc {
  const parsed = protobuf.parse(protoSource, {
    // Keep field and oneof names snake_case as written in the proto; the
    // protobufjs default camelizes them, which would break the documented
    // FieldDoc contract ("field names are snake_case as in the proto").
    keepCase: true,
    alternateCommentMode: true,
    preferTrailingComment: false,
  });
  const pkg = parsed.package;
  if (!pkg) {
    throw new Error(`${sourcePath} has no package declaration`);
  }
  parsed.root.resolveAll();

  const routes = new Map(parseRestRules(yamlText).map((r) => [r.selector, r]));
  const ns = parsed.root.lookup(pkg);
  if (!(ns instanceof protobuf.Namespace)) {
    throw new Error(`package ${pkg} not found in ${sourcePath}`);
  }
  const services = ns.nestedArray.filter(
    (n): n is protobuf.Service => n instanceof protobuf.Service,
  );
  if (services.length === 0) {
    throw new Error(`${sourcePath} defines no services`);
  }

  const problems: string[] = [];
  const messages: Record<string, MessageDoc> = {};
  const enums: Record<string, EnumDoc> = {};
  const methods: MethodDoc[] = [];

  function addEnum(enm: protobuf.Enum): void {
    if (enums[enm.name]) return;
    enums[enm.name] = {
      name: enm.name,
      comment: sanitizeComment(enm.comment ?? ''),
      values: Object.entries(enm.values).map(([name, value]) => ({
        name,
        value,
        comment: sanitizeComment(enm.comments[name] ?? ''),
      })),
    };
  }

  function addMessage(type: protobuf.Type): void {
    if (messages[type.name]) return;
    messages[type.name] = {
      name: type.name,
      comment: sanitizeComment(type.comment ?? ''),
      fields: type.fieldsArray.map((f) => {
        // protobufjs models proto3 `optional` as membership in a synthetic
        // oneof named `_<field>`; that is what "optional" means here. Real
        // oneofs keep their declared name; synthetic ones are not oneofs.
        const synthetic = f.partOf != null && f.partOf.name.startsWith('_');
        return {
          name: f.name,
          type: f.resolvedType ? f.resolvedType.name : f.type,
          repeated: f.repeated,
          optional: synthetic,
          oneof: f.partOf && !synthetic ? f.partOf.name : null,
          comment: sanitizeComment(f.comment ?? ''),
        };
      }),
    };
  }

  // Depth-first walk over resolved field types, recording each referenced
  // message/enum once in discovery order.
  function collect(type: protobuf.Type, out: string[], seen: Set<string>): void {
    for (const field of type.fieldsArray) {
      const rt = field.resolvedType;
      if (!rt || seen.has(rt.name)) continue;
      seen.add(rt.name);
      out.push(rt.name);
      if (rt instanceof protobuf.Enum) {
        addEnum(rt);
      } else {
        addMessage(rt);
        collect(rt, out, seen);
      }
    }
  }

  for (const svc of services) {
    if (!svc.comment) {
      problems.push(`service ${svc.name} has no doc comment`);
    }
    for (const m of svc.methodsArray) {
      const selector = `${pkg}.${svc.name}.${m.name}`;
      const route = routes.get(selector);
      if (!route) {
        problems.push(`method ${selector} has no gateway route`);
        continue;
      }
      if (!m.comment) {
        problems.push(`method ${selector} has no doc comment`);
      }
      const req = parsed.root.lookupType(m.requestType);
      const res = parsed.root.lookupType(m.responseType);
      addMessage(req);
      addMessage(res);
      const referenced: string[] = [];
      const seen = new Set<string>([req.name, res.name]);
      collect(req, referenced, seen);
      collect(res, referenced, seen);
      methods.push({
        name: m.name,
        slug: kebab(m.name),
        service: svc.name,
        comment: sanitizeComment(m.comment ?? ''),
        requestType: req.name,
        responseType: res.name,
        requestStream: m.requestStream === true,
        responseStream: m.responseStream === true,
        rest: { method: route.method, path: route.path },
        referencedTypes: referenced,
      });
    }
  }

  for (const msg of Object.values(messages)) {
    for (const f of msg.fields) {
      if (!f.comment) {
        problems.push(`field ${msg.name}.${f.name} has no doc comment`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`proto extraction failed:\n  ${problems.join('\n  ')}`);
  }

  return {
    source: sourcePath,
    package: pkg,
    services: services.map((s) => ({
      name: s.name,
      comment: sanitizeComment(s.comment ?? ''),
      methods: s.methodsArray.map((m) => m.name),
    })),
    methods,
    messages,
    enums,
  };
}
