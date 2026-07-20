import type { MdastPluginDefinition, MdxJsxFlowElement } from 'satteri';

import { mermaidInitDirective } from '../config/mermaid.ts';

/**
 * Sätteri mdast plugin that makes ```mermaid fences work in .mdx files.
 *
 * astro-mermaid's own plugin rewrites mermaid fences into a raw `html`
 * node. Plain markdown emits that verbatim, but the MDX compile has no
 * raw-HTML support, so the value is escaped and shows up as literal text.
 * This plugin is registered ahead of astro-mermaid's and claims mermaid
 * fences in .mdx files first, rewriting them into real JSX nodes: the
 * `.wdk-mermaid > pre.mermaid` structure the site styles, with the
 * shared init directive prepended. astro-mermaid's page script then
 * renders any `pre.mermaid` element client-side. Fences in .md files are
 * left alone for astro-mermaid, whose raw-HTML path works there.
 */
export const mermaidFencePlugin: MdastPluginDefinition = {
  name: 'mermaid-fence-mdx',
  code(node, ctx) {
    if (node.lang !== 'mermaid') return;
    if (!ctx.fileURL?.pathname.endsWith('.mdx')) return;

    const source = `${mermaidInitDirective}\n${node.value.trim()}`;
    return jsxElement('div', 'wdk-mermaid', [
      jsxElement('pre', 'mermaid', [{ type: 'text', value: source }]),
    ]);
  },
};

function jsxElement(
  name: string,
  className: string,
  children: unknown[],
): MdxJsxFlowElement {
  return {
    type: 'mdxJsxFlowElement',
    name,
    attributes: [{ type: 'mdxJsxAttribute', name: 'class', value: className }],
    children,
  } as MdxJsxFlowElement;
}
