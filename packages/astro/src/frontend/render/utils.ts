import unified from 'unified';
import parse from 'rehype-parse';
import toH from 'hast-to-hyperscript';
import { ComponentRenderer } from '../../@types/renderer';
import moize from 'moize';

/** @internal */
function childrenToTree(children: string[]): any[] {
  return [].concat(...children.map((child) => (unified().use(parse, { fragment: true }).parse(child) as any).children));
}

/**
 * Converts an HTML fragment string into vnodes for rendering via provided framework
 * @param h framework's `createElement` function
 * @param children the HTML string children
 */
export const childrenToVnodes = moize.deep(function childrenToVnodes(h: any, children: string[]) {
  const tree = childrenToTree(children);
  const vnodes = tree.map((subtree) => {
    if (subtree.type === 'text') return subtree.value;
    return toH(h, subtree);
  });
  return vnodes;
});

/**
 * Converts an HTML fragment string into h function calls as a string
 * @param h framework's `createElement` function
 * @param children the HTML string children
 */
export const childrenToH = moize.deep(function childrenToH(renderer: ComponentRenderer<any>, children: string[]): any {
  if (!renderer.jsxPragma) return;

  const tree = childrenToTree(children);
  const innerH = (name: any, attrs: Record<string, any> | null = null, _children: string[] | null = null) => {
    const vnode = renderer.jsxPragma?.(name, attrs, _children);
    const childStr = _children ? `, [${_children.map((child) => serializeChild(child)).join(',')}]` : '';
    if (attrs && attrs.key) attrs.key = Math.random();
    const __SERIALIZED = `${renderer.jsxPragmaName}("${name}", ${attrs ? JSON.stringify(attrs) : 'null'}${childStr})` as string;
    return { ...vnode, __SERIALIZED };
  };

  const simpleTypes = new Set(['number', 'boolean']);
  const serializeChild = (child: unknown) => {
    if (typeof child === 'string') return JSON.stringify(child).replace(/<\/script>/gmi, '</script" + ">');
    if (simpleTypes.has(typeof child)) return JSON.stringify(child);
    if (child === null) return `null`;
    if ((child as any).__SERIALIZED) return (child as any).__SERIALIZED;
    return innerH(child).__SERIALIZED;
  };
  return tree.map((subtree) => {
    if (subtree.type === 'text') return JSON.stringify(subtree.value);
    return toH(innerH, subtree).__SERIALIZED;
  });
});
