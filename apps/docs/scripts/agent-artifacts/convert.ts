// Converts a built docs page's HTML into clean markdown for agent consumption.
// The extraction root is [data-pagefind-body], the same region Pagefind
// indexes, so site chrome never leaks into the mirrors.
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { select, selectAll } from 'hast-util-select';
import { toText } from 'hast-util-to-text';
import { visit, SKIP } from 'unist-util-visit';
import type { Element, ElementContent, Root } from 'hast';

export interface ConvertedPage {
  title: string;
  description: string | null;
  markdown: string;
}

function text(node: Element | undefined): string {
  return node ? toText(node).trim() : '';
}

function codeBlock(lang: string, value: string, title?: string): Element {
  const meta = title ? ` title="${title}"` : '';
  return {
    type: 'element',
    tagName: 'pre',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'code',
        // rehype-remark reads the language from the class and the rest of
        // the fence info string from data-meta.
        properties: { className: [`language-${lang}`], dataMeta: meta.trim() || undefined },
        children: [{ type: 'text', value }],
      },
    ],
  };
}

function paragraph(value: string): Element {
  return {
    type: 'element',
    tagName: 'p',
    properties: {},
    children: [
      { type: 'element', tagName: 'em', properties: {}, children: [{ type: 'text', value }] },
    ],
  };
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// Rewrites site-specific markup into plain HTML that rehype-remark
// understands: code frames, mermaid sources, callouts, and islands.
function normalize(body: Element): void {
  visit(body, 'element', (node: Element, index, parent) => {
    if (!parent || typeof index !== 'number') return undefined;
    const cls = Array.isArray(node.properties?.className) ? node.properties.className : [];

    if (HEADING_TAGS.has(node.tagName)) {
      // A <br> inside a heading is the only thing that forces remark-stringify
      // to emit a Setext heading (text\n===) instead of an ATX heading
      // (# text), since Setext is the only form that can carry a hard line
      // break. Replace it with a space so headings always stringify as ATX.
      let sawBreak = false;
      node.children = node.children.flatMap((child) => {
        if (child.type === 'element' && child.tagName === 'br') {
          sawBreak = true;
          return [{ type: 'text', value: ' ' } as ElementContent];
        }
        return [child];
      });
      if (sawBreak) {
        for (const child of node.children) {
          if (child.type === 'text') child.value = child.value.replace(/ {2,}/g, ' ');
        }
      }
    }

    if (node.tagName === 'div' && cls.includes('expressive-code')) {
      const pre = select('pre[data-language]', node);
      const lang = String(pre?.properties?.dataLanguage ?? 'text');
      const copyBtn = select('button[data-code]', node);
      // The real expressive-code copy button joins lines with U+007F (DEL),
      // not a newline; its own copy-to-clipboard script does the same
      // replacement client-side before writing to the clipboard.
      const code = copyBtn
        ? String(copyBtn.properties?.dataCode ?? '').replace(/\x7f/g, '\n')
        : selectAll('.ec-line', node).map((l) => toText(l)).join('\n');
      const title = text(select('figcaption .title', node) ?? undefined) || undefined;
      parent.children[index] = codeBlock(lang, code, title);
      return SKIP;
    }

    if (node.tagName === 'pre' && cls.includes('mermaid')) {
      parent.children[index] = codeBlock('mermaid', toText(node).trim());
      return SKIP;
    }

    if (node.tagName === 'aside' && cls.includes('wdk-callout')) {
      const label = text(select('.wdk-callout__title', node) ?? undefined);
      const bodyEl = select('.wdk-callout__body', node);
      const children: ElementContent[] = [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            { type: 'element', tagName: 'strong', properties: {}, children: [{ type: 'text', value: label }] },
          ],
        },
        ...(bodyEl?.children ?? []),
      ];
      parent.children[index] = { type: 'element', tagName: 'blockquote', properties: {}, children };
      return SKIP;
    }

    if (node.tagName === 'astro-island') {
      parent.children[index] = paragraph(
        'Interactive example omitted; open this page in a browser to use it.',
      );
      return SKIP;
    }

    if (node.properties && 'dataPagefindIgnore' in node.properties) {
      parent.children.splice(index, 1);
      return index;
    }
    return undefined;
  });

  // Astro does not strip HTML comments from the built markup (layout
  // section markers, editor notes), and rehype-remark otherwise carries
  // them through as raw HTML nodes. Drop them so they never reach the
  // markdown output.
  visit(body, 'comment', (_node, index, parent) => {
    if (!parent || typeof index !== 'number') return undefined;
    parent.children.splice(index, 1);
    return index;
  });
}

export function convertPageHtml(html: string): ConvertedPage | null {
  const tree = unified().use(rehypeParse).parse(html);
  const body = select('[data-pagefind-body]', tree);
  if (!body) return null;

  const rawTitle = text(select('head title', tree) ?? undefined);
  const title = rawTitle.replace(/ \| Wavelength$/, '');
  const descEl = select('head meta[name="description"]', tree);
  const description = descEl ? String(descEl.properties?.content ?? '') : null;

  normalize(body);
  const root: Root = { type: 'root', children: body.children };
  const mdast = unified().use(rehypeRemark).runSync(root as never);
  const markdown = unified()
    .use(remarkGfm)
    .use(remarkStringify, { bullet: '-', fences: true, rule: '-' })
    .stringify(mdast as never)
    .trim();

  return { title, description, markdown: `${markdown}\n` };
}
