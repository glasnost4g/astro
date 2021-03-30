import crypto from 'crypto';
import path from 'path';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import findUp from 'find-up';
import sass from 'sass';
import { Optimizer } from '../../@types/optimizer';
import type { TemplateNode } from '../../parser/interfaces';
import astroScopedStyles from './postcss-scoped-styles/index.js';

type StyleType = 'css' | 'scss' | 'sass' | 'postcss';

const getStyleType: Map<string, StyleType> = new Map([
  ['.css', 'css'],
  ['.pcss', 'postcss'],
  ['.sass', 'sass'],
  ['.scss', 'scss'],
  ['css', 'css'],
  ['postcss', 'postcss'],
  ['sass', 'sass'],
  ['scss', 'scss'],
  ['text/css', 'css'],
  ['text/postcss', 'postcss'],
  ['text/sass', 'sass'],
  ['text/scss', 'scss'],
]);

const SASS_OPTIONS: Partial<sass.Options> = {
  outputStyle: 'compressed',
};
/** HTML tags that should never get scoped classes */
const NEVER_SCOPED_TAGS = new Set<string>(['html', 'head', 'body', 'script', 'style', 'link', 'meta']);

/** Should be deterministic, given a unique filename */
function hashFromFilename(filename: string): string {
  const hash = crypto.createHash('sha256');
  return hash
    .update(filename.replace(/\\/g, '/'))
    .digest('base64')
    .toString()
    .replace(/[^A-Za-z0-9-]/g, '')
    .substr(0, 8);
}

export interface StyleTransformResult {
  css: string;
  type: StyleType;
}

// cache node_modules resolutions for each run. saves looking up the same directory over and over again. blown away on exit.
const nodeModulesMiniCache = new Map<string, string>();

/** Convert styles to scoped CSS */
async function transformStyle(code: string, { type, filename, scopedClass }: { type?: string; filename: string; scopedClass: string }): Promise<StyleTransformResult> {
  let styleType: StyleType = 'css'; // important: assume CSS as default
  if (type) {
    styleType = getStyleType.get(type) || styleType;
  }

  // add file path to includePaths
  let includePaths: string[] = [path.dirname(filename)];

  // include node_modules to includePaths (allows @use-ing node modules, if it can be located)
  const cachedNodeModulesDir = nodeModulesMiniCache.get(filename);
  if (cachedNodeModulesDir) {
    includePaths.push(cachedNodeModulesDir);
  } else {
    const nodeModulesDir = await findUp('node_modules', { type: 'directory', cwd: path.dirname(filename) });
    if (nodeModulesDir) {
      nodeModulesMiniCache.set(filename, nodeModulesDir);
      includePaths.push(nodeModulesDir);
    }
  }

  let css = '';
  switch (styleType) {
    case 'css': {
      css = code;
      break;
    }
    case 'sass':
    case 'scss': {
      css = sass.renderSync({ ...SASS_OPTIONS, data: code, includePaths }).css.toString('utf8');
      break;
    }
    default: {
      throw new Error(`Unsupported: <style lang="${styleType}">`);
    }
  }

  css = await postcss([astroScopedStyles({ className: scopedClass }), autoprefixer()])
    .process(css, { from: filename, to: undefined })
    .then((result) => result.css);

  return { css, type: styleType };
}

export default function ({ filename, fileID }: { filename: string; fileID: string }): Optimizer {
  const styleNodes: TemplateNode[] = []; // <style> tags to be updated
  const styleTransformPromises: Promise<StyleTransformResult>[] = []; // async style transform results to be finished in finalize();
  let rootNode: TemplateNode; // root node which needs <style> tags

  const scopedClass = `astro-${hashFromFilename(fileID)}`; // this *should* generate same hash from fileID every time

  return {
    visitors: {
      html: {
        Element: {
          enter(node) {
            // 1. if <style> tag, transform it and continue to next node
            if (node.name === 'style') {
              // Same as ast.css (below)
              const code = Array.isArray(node.children) ? node.children.map(({ data }: any) => data).join('\n') : '';
              if (!code) return;
              const langAttr = (node.attributes || []).find(({ name }: any) => name === 'lang');
              styleNodes.push(node);
              styleTransformPromises.push(
                transformStyle(code, {
                  type: (langAttr && langAttr.value[0] && langAttr.value[0].data) || undefined,
                  filename,
                  scopedClass,
                })
              );
              return;
            }

            // 2. find the root node to inject the <style> tag in later
            // TODO: remove this when we are injecting <link> tags into <head>
            if (node.name === 'head') {
              rootNode = node; // If this is <head>, this is what we want. Always take this if found. However, this may not always exist (it won’t for Component subtrees).
            } else if (!rootNode) {
              rootNode = node; // If no <head> (yet), then take the first element we come to and assume it‘s the “root” (but if we find a <head> later, then override this per the above)
            }

            // 3. add scoped HTML classes
            if (NEVER_SCOPED_TAGS.has(node.name)) return; // only continue if this is NOT a <script> tag, etc.
            // Note: currently we _do_ scope web components/custom elements. This seems correct?

            if (!node.attributes) node.attributes = [];
            const classIndex = node.attributes.findIndex(({ name }: any) => name === 'class');
            if (classIndex === -1) {
              // 3a. element has no class="" attribute; add one and append scopedClass
              node.attributes.push({ start: -1, end: -1, type: 'Attribute', name: 'class', value: [{ type: 'Text', raw: scopedClass, data: scopedClass }] });
            } else {
              // 3b. element has class=""; append scopedClass
              const attr = node.attributes[classIndex];
              for (let k = 0; k < attr.value.length; k++) {
                if (attr.value[k].type === 'Text') {
                  // string literal
                  attr.value[k].raw += ' ' + scopedClass;
                  attr.value[k].data += ' ' + scopedClass;
                } else if (attr.value[k].type === 'MustacheTag' && attr.value[k]) {
                  // MustacheTag
                  attr.value[k].content = `(${attr.value[k].content}) + ' ${scopedClass}'`;
                }
              }
            }
          },
        },
      },
      // CSS: compile styles, apply CSS Modules scoping
      css: {
        Style: {
          enter(node) {
            // Same as ast.html (above)
            // Note: this is duplicated from html because of the compiler we‘re using; in a future version we should combine these
            if (!node.content || !node.content.styles) return;
            const code = node.content.styles;
            const langAttr = (node.attributes || []).find(({ name }: any) => name === 'lang');
            styleNodes.push(node);
            styleTransformPromises.push(
              transformStyle(code, {
                type: (langAttr && langAttr.value[0] && langAttr.value[0].data) || undefined,
                filename,
                scopedClass,
              })
            );

            // TODO: we should delete the old untransformed <style> node after we’re done.
            // However, the svelte parser left it in ast.css, not ast.html. At the final step, this just gets ignored, so it will be deleted, in a sense.
            // If we ever end up scanning ast.css for something else, then we’ll need to actually delete the node (or transform it to the processed version)
          },
        },
      },
    },
    async finalize() {
      const styleTransforms = await Promise.all(styleTransformPromises);

      if (!rootNode) {
        throw new Error(`No root node found`); // TODO: remove this eventually; we should always find it, but for now alert if there’s a bug in our code
      }

      // 1. transform <style> tags
      styleTransforms.forEach((result, n) => {
        if (styleNodes[n].attributes) {
          // 1b. Inject final CSS
          const isHeadStyle = !styleNodes[n].content;
          if (isHeadStyle) {
            // Note: <style> tags in <head> have different attributes/rules, because of the parser. Unknown why
            (styleNodes[n].children as any) = [{ ...(styleNodes[n].children as any)[0], data: result.css }];
          } else {
            styleNodes[n].content.styles = result.css;
          }

          // 3b. Update <style> attributes
          const styleTypeIndex = styleNodes[n].attributes.findIndex(({ name }: any) => name === 'type');
          if (styleTypeIndex !== -1) {
            console.log(styleNodes[n].attributes[styleTypeIndex]);
            styleNodes[n].attributes[styleTypeIndex].value[0].raw = 'text/css';
            styleNodes[n].attributes[styleTypeIndex].value[0].data = 'text/css';
          } else {
            styleNodes[n].attributes.push({ name: 'type', type: 'Attribute', value: [{ type: 'Text', raw: 'text/css', data: 'text/css' }] });
          }
          const styleLangIndex = styleNodes[n].attributes.findIndex(({ name }: any) => name === 'lang');
          if (styleLangIndex !== -1) styleNodes[n].attributes.splice(styleLangIndex, 1);
        }
      });

      // 2. inject finished <style> tags into root node
      // TODO: pull out into <link> tags for deduping
      rootNode.children = [...styleNodes, ...(rootNode.children || [])];
    },
  };
}
