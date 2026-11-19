/**
 * The render engine's readers in the page (J-123 S5;
 * `workshop/components/interface-rules.md`, "The engines"): plain
 * JavaScript sources the shell evaluates in a browser over its DevTools
 * protocol, each an expression whose value is JSON. They are text and never
 * functions of this module, so no build step can rewrite what reaches the
 * page. The snapshot's shape is `renderSnapshotSchema` in
 * `./interface-render.ts`, which parses what comes back; the rules are
 * judged there, in code, from the snapshot alone.
 */

/** How many elements a snapshot records at most, so a huge page cannot hold the run. */
const SNAPSHOT_LIMIT = 4000;

/**
 * The snapshot of the page as it rests: its size and scroll width, every
 * rendered element that carries text, takes input, shows an image or a
 * landmark, or paints a layer, with its box, its colours resolved against
 * the ground behind it, its type and its overflow; the fonts the document
 * holds; and the kept inventory of links, fields, test hooks, ids and
 * headings.
 */
export const SNAPSHOT_SOURCE: string = String.raw`(() => {
  const LIMIT = ${String(SNAPSHOT_LIMIT)};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sx = window.scrollX;
  const sy = window.scrollY;
  const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=radio],[onclick],[tabindex]:not([tabindex="-1"])';
  const LANDMARK = new Set(['NAV', 'DIALOG', 'HEADER', 'FOOTER', 'MAIN', 'SECTION', 'ARTICLE', 'ASIDE', 'FORM', 'TABLE', 'MARQUEE', 'VIDEO', 'IMG', 'SVG', 'CANVAS', 'PICTURE']);
  const recorded = new Map();
  const elements = [];
  const opaque = (value) => value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent';
  const groundOf = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none' && /gradient|url\(/.test(style.backgroundImage)) return { colour: opaque(style.backgroundColor) ? style.backgroundColor : null, image: true };
      if (opaque(style.backgroundColor)) return { colour: style.backgroundColor, image: false };
    }
    return { colour: 'rgb(255, 255, 255)', image: false };
  };
  const opacityOf = (element) => {
    let value = 1;
    for (let node = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
    return value;
  };
  const ownText = (element) => {
    let text = '';
    for (const child of element.childNodes) if (child.nodeType === 3) text += child.textContent;
    return text.replace(/\s+/g, ' ').trim().slice(0, 400);
  };
  const nameOf = (element) => {
    const label = element.getAttribute('aria-label');
    if (label) return label.trim();
    const by = element.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
    if (element.tagName === 'IMG') return (element.getAttribute('alt') ?? '').trim();
    if (element.labels && element.labels.length > 0) return [...element.labels].map((l) => l.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
    const title = element.getAttribute('title');
    const text = (element.innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text || (title ?? '').trim();
  };
  // A control's visible label: its own text, but a native select shows its options, so its label is its label's text, then aria-labelledby's, then aria-label (J-173 S1).
  const labelOf = (element) => {
    if (element.tagName !== 'SELECT') return (element.innerText ?? '').replace(/\s+/g, ' ').trim();
    const textOf = (node) => {
      const copy = node.cloneNode(true);
      for (const inner of copy.querySelectorAll('select, option, optgroup, datalist')) inner.remove();
      return copy.textContent ?? '';
    };
    const labels = element.labels && element.labels.length > 0 ? [...element.labels].map(textOf).join(' ') : '';
    const by = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean).map((id) => { const node = document.getElementById(id); return node ? textOf(node) : ''; }).join(' ');
    return (labels.trim() || by.trim() || (element.getAttribute('aria-label') ?? '')).replace(/\s+/g, ' ').trim();
  };
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (const element of all) {
    if (elements.length >= LIMIT) break;
    const style = getComputedStyle(element);
    if (style.display === 'none') continue;
    // An inline element that wraps is read by its first line's box, since its whole box spans lines it does not cover.
    const rect = style.display === 'inline' ? (element.getClientRects()[0] ?? element.getBoundingClientRect()) : element.getBoundingClientRect();
    const text = ownText(element);
    const interactive = element.matches(INTERACTIVE);
    const layer = style.position === 'fixed' || style.position === 'sticky' || style.backdropFilter.includes('blur') || style.boxShadow !== 'none' || /gradient/.test(style.backgroundImage) || style.animationName !== 'none';
    const role = element.getAttribute('role') ?? '';
    if (!text && !interactive && !layer && !LANDMARK.has(element.tagName.toUpperCase()) && !role && !/^H[1-6]$/.test(element.tagName)) continue;
    let parent = -1;
    for (let node = element.parentElement; node; node = node.parentElement) if (recorded.has(node)) { parent = recorded.get(node); break; }
    const ground = groundOf(element);
    const fontSize = parseFloat(style.fontSize) || 0;
    const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(style.lineHeight) || fontSize * 1.2;
    const index = elements.length;
    recorded.set(element, index);
    element.setAttribute('data-gl-i', String(index));
    const iterations = style.animationIterationCount.split(',')[0].trim();
    elements.push({
      i: index,
      parent,
      tag: element.tagName.toLowerCase(),
      role,
      id: element.id || '',
      name: interactive || role || element.tagName === 'IMG' || element.tagName === 'DIALOG' || element.tagName === 'NAV' ? nameOf(element).slice(0, 200) : '',
      label: interactive ? labelOf(element).slice(0, 200) : '',
      text,
      length: /^(P|LI|BLOCKQUOTE|DD)$/.test(element.tagName) ? (element.innerText ?? '').replace(/\s+/g, ' ').trim().length : text.length,
      x: rect.left + sx,
      y: rect.top + sy,
      w: rect.width,
      h: rect.height,
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
      opacity: opacityOf(element),
      colour: style.color,
      ground: ground.colour,
      groundImage: ground.image,
      fontSize,
      fontWeight: Number(style.fontWeight) || 400,
      fontFamily: style.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase(),
      fontStyle: style.fontStyle,
      lineHeight,
      lines: text ? Math.max(1, Math.round(rect.height / lineHeight)) : 0,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      textOverflow: style.textOverflow,
      lineClamp: style.webkitLineClamp && style.webkitLineClamp !== 'none' ? style.webkitLineClamp : '',
      whiteSpace: style.whiteSpace,
      position: style.position,
      top: style.top === 'auto' ? null : parseFloat(style.top),
      zIndex: style.zIndex === 'auto' ? 0 : Number(style.zIndex) || 0,
      interactive,
      focusable: element.tabIndex >= 0 && !element.disabled,
      inline: style.display === 'inline',
      inputType: element.tagName === 'INPUT' ? (element.getAttribute('type') ?? 'text') : '',
      borderColour: style.borderTopColor,
      borderWidth: parseFloat(style.borderTopWidth) || 0,
      animation: style.animationName === 'none' ? null : { name: style.animationName, seconds: parseFloat(style.animationDuration) || 0, infinite: iterations === 'infinite', count: iterations === 'infinite' ? 0 : Number(iterations) || 1, running: style.animationPlayState !== 'paused' },
      backdrop: style.backdropFilter.includes('blur'),
      shadow: style.boxShadow !== 'none',
      gradient: /gradient/.test(style.backgroundImage),
      clipText: style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text',
      backgroundColour: style.backgroundColor,
      pointerEvents: style.pointerEvents,
      img: element.tagName === 'IMG' ? { src: element.currentSrc || element.getAttribute('src') || '', loading: element.getAttribute('loading') ?? '', complete: element.complete, naturalWidth: element.naturalWidth } : null,
      expanded: element.getAttribute('aria-expanded') ?? '',
      haspopup: element.getAttribute('aria-haspopup') ?? '',
      open: element.tagName === 'DIALOG' ? element.open : element.getAttribute('aria-modal') === 'true' || role === 'dialog' || role === 'alertdialog',
    });
  }
  const covering = (entry) => {
    if (!entry.visible || entry.w < 2 || entry.h < 2) return [];
    const points = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5]];
    const found = [];
    for (const [fx, fy] of points) {
      const x = entry.x - sx + entry.w * fx;
      const y = entry.y - sy + entry.h * fy;
      if (x < 0 || y < 0 || x >= vw || y >= vh) { found.push(-2); continue; }
      const top = document.elementFromPoint(x, y);
      const self = document.querySelector('[data-gl-i="' + entry.i + '"]');
      if (!top || !self) { found.push(-2); continue; }
      if (top === self || self.contains(top)) { found.push(-1); continue; }
      if (top.contains(self)) { found.push(-4); continue; }
      let marker = -3;
      for (let node = top; node; node = node.parentElement) { const at = node.getAttribute && node.getAttribute('data-gl-i'); if (at !== null && at !== undefined) { marker = Number(at); break; } }
      found.push(marker);
    }
    return found;
  };
  for (const entry of elements) entry.cover = (entry.interactive || entry.text) && entry.y - sy < vh && entry.y + entry.h - sy > 0 ? covering(entry) : [];
  const fonts = [];
  if (document.fonts) for (const face of document.fonts) fonts.push({ family: face.family.replace(/["']/g, '').trim().toLowerCase(), weight: face.weight, style: face.style, status: face.status });
  const inventory = {
    links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') + ' ' + (a.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)),
    fields: [...document.querySelectorAll('input,select,textarea')].map((f) => (f.getAttribute('type') ?? f.tagName.toLowerCase()) + ' ' + (f.getAttribute('name') ?? f.id ?? '')),
    actions: [...document.querySelectorAll('form,button[type=submit],input[type=submit]')].map((f) => f.tagName.toLowerCase() + ' ' + (f.getAttribute('action') ?? f.getAttribute('formaction') ?? (f.innerText ?? f.value ?? '').trim().slice(0, 60))),
    handlers: [...document.querySelectorAll('*')].flatMap((e) => [...e.attributes].filter((a) => /^on[a-z]+$/.test(a.name)).map((a) => a.name + ' ' + (e.id || e.tagName.toLowerCase()))),
    testHooks: [...document.querySelectorAll('[data-testid],[data-test],[data-cy]')].map((e) => e.getAttribute('data-testid') ?? e.getAttribute('data-test') ?? e.getAttribute('data-cy') ?? ''),
    ids: [...document.querySelectorAll('[id]')].map((e) => e.id).filter((id) => id !== ''),
    headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => h.tagName.toLowerCase() + ' ' + (h.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)),
  };
  return JSON.stringify({
    width: vw,
    height: vh,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    lang: document.documentElement.getAttribute('lang') ?? '',
    colorScheme: getComputedStyle(document.documentElement).colorScheme ?? '',
    elements,
    fonts,
    inventory,
  });
})()`;

/**
 * Each focus stop's look before it is reached, kept on the element, so the
 * focus walk can tell whether reaching it changed anything.
 */
export const FOCUS_PREPARE_SOURCE: string = String.raw`(() => {
  const look = (style) => [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.borderTopColor, style.borderBottomColor, style.backgroundColor, style.color, style.textDecorationLine].join('|');
  let count = 0;
  for (const element of document.querySelectorAll('*')) {
    if (element.tabIndex < 0 || element.disabled) continue;
    element.setAttribute('data-gl-look', look(getComputedStyle(element)));
    count += 1;
  }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  return JSON.stringify({ count });
})()`;

/**
 * One focus stop after a Tab: the element reached, whether its look
 * changed, and whether every point of it is covered by another layer.
 */
export const FOCUS_STEP_SOURCE: string = String.raw`(() => {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return JSON.stringify({ at: null });
  const style = getComputedStyle(active);
  const look = [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.borderTopColor, style.borderBottomColor, style.backgroundColor, style.color, style.textDecorationLine].join('|');
  const before = active.getAttribute('data-gl-look');
  const rect = active.getBoundingClientRect();
  const points = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
  let covered = rect.width > 0 && rect.height > 0;
  for (const [fx, fy] of points) {
    const x = rect.left + rect.width * fx;
    const y = rect.top + rect.height * fy;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
    const top = document.elementFromPoint(x, y);
    if (!top || top === active || active.contains(top) || top.contains(active)) { covered = false; break; }
  }
  const key = active.getAttribute('data-gl-i') ?? (active.tagName.toLowerCase() + '#' + (active.id || '') + '@' + Math.round(rect.left) + ',' + Math.round(rect.top + window.scrollY));
  return JSON.stringify({
    at: key,
    tag: active.tagName.toLowerCase(),
    name: (active.getAttribute('aria-label') ?? active.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    changed: before === null ? true : before !== look,
    covered,
  });
})()`;

/** The styles WCAG 1.4.12 asks text to survive, applied to every element. */
export const TEXT_SPACING_SOURCE: string = String.raw`(() => {
  const style = document.createElement('style');
  style.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';
  document.head.appendChild(style);
  return JSON.stringify({ applied: true });
})()`;

/** Text at 200%: the root's size doubled, which every size set in rem or em follows. */
export const TEXT_RESIZE_SOURCE: string = String.raw`(() => {
  document.documentElement.style.fontSize = '200%';
  return JSON.stringify({ applied: true });
})()`;

/** Wait for the fonts and the images, then half a second for entrance motion, so the page is read settled; timers run in a page in the background where frames do not. */
export const SETTLE_SOURCE: string = String.raw`(async () => {
  if (document.fonts) await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.complete ? null : new Promise((done) => { image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }); setTimeout(done, 5000); })));
  await new Promise((done) => setTimeout(done, 500));
  return JSON.stringify({ settled: true });
})()`;

/**
 * The colours of a screenshot, sampled on a grid: each sampled pixel's
 * colour as hex, rounded to steps of eight per channel, with its count.
 * @param dataUrl the screenshot as a data URL
 * @returns the expression to evaluate on a blank page
 */
export function samplePixelsSource(dataUrl: string): string {
  return String.raw`(async () => {
  const image = new Image();
  await new Promise((done, fail) => { image.onload = done; image.onerror = fail; image.src = ${JSON.stringify(dataUrl)}; });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const steps = 96;
  const counts = {};
  const hex = (value) => Math.min(255, Math.round(value / 8) * 8).toString(16).padStart(2, '0');
  for (let row = 0; row < steps; row += 1)
    for (let column = 0; column < steps; column += 1) {
      const x = Math.floor((column + 0.5) * canvas.width / steps);
      const y = Math.floor((row + 0.5) * canvas.height / steps);
      const [r, g, b] = context.getImageData(x, y, 1, 1).data;
      const key = '#' + hex(r) + hex(g) + hex(b);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  return JSON.stringify(counts);
})()`;
}

/** How many elements the boxes reader records at most, so a huge page cannot hold the run. */
const BOXES_READ_LIMIT = 4000;

/**
 * The page's boxes (J-124 S1): every rendered element below the body with a
 * box of some size, its rectangle in the page's coordinates, its tag, its
 * role, its visible text or name, a selector that finds it again, and the
 * source location a development build carries: React's debug source on
 * the element's fiber or its owners', react-dev-inspector's attributes,
 * Vue's inspector attribute or its component's file, Svelte's meta. An
 * SVG's inner parts are left out; the SVG stands for them.
 */
export const BOXES_SOURCE: string = String.raw`(() => {
  const LIMIT = ${String(BOXES_READ_LIMIT)};
  const sx = window.scrollX;
  const sy = window.scrollY;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'BR', 'WBR', 'BASE']);
  const ROLES = { BUTTON: 'button', NAV: 'navigation', MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo', ASIDE: 'complementary', FORM: 'form', IMG: 'img', UL: 'list', OL: 'list', LI: 'listitem', TABLE: 'table', TR: 'row', TD: 'cell', TH: 'columnheader', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading', SELECT: 'combobox', TEXTAREA: 'textbox', DIALOG: 'dialog', ARTICLE: 'article', SUMMARY: 'button', PROGRESS: 'progressbar', HR: 'separator', FIGURE: 'figure', P: 'paragraph', svg: 'img' };
  const INPUTS = { button: 'button', submit: 'button', reset: 'button', checkbox: 'checkbox', radio: 'radio', range: 'slider', search: 'searchbox', email: 'textbox', text: 'textbox', tel: 'textbox', url: 'textbox', password: 'textbox', number: 'spinbutton' };
  const roleOf = (element) => {
    const stated = element.getAttribute('role');
    if (stated) return stated.trim().split(/\s+/)[0];
    if (element.tagName === 'A') return element.hasAttribute('href') ? 'link' : null;
    if (element.tagName === 'INPUT') return INPUTS[(element.getAttribute('type') ?? 'text').toLowerCase()] ?? null;
    if (element.tagName === 'SECTION') return element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby') ? 'region' : null;
    return ROLES[element.tagName] ?? null;
  };
  const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const textOf = (element) => {
    const label = element.getAttribute('aria-label');
    if (label) return clean(label);
    const inner = clean(element.innerText ?? element.textContent ?? '');
    if (inner) return inner;
    for (const name of ['alt', 'placeholder', 'title', 'value']) {
      const value = element.getAttribute(name);
      if (value) return clean(value);
    }
    return '';
  };
  const unique = (selector) => {
    try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
  };
  const quoted = (value) => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const selectorOf = (element) => {
    if (element.id && unique('#' + CSS.escape(element.id))) return '#' + CSS.escape(element.id);
    for (const name of ['data-testid', 'data-test', 'data-cy']) {
      const value = element.getAttribute(name);
      if (value && unique('[' + name + '=' + quoted(value) + ']')) return '[' + name + '=' + quoted(value) + ']';
    }
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (node !== element && node.id && unique('#' + CSS.escape(node.id))) { parts.unshift('#' + CSS.escape(node.id)); break; }
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      let part = tag;
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (same.length > 1) part += ':nth-of-type(' + String(same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
    }
    return parts.join(' > ');
  };
  const number = (value) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null);
  const located = (text, via) => {
    const found = /^(.*?):(\d+)(?::(\d+))?$/.exec(text);
    return found ? { file: found[1], line: Number(found[2]), column: found[3] === undefined ? null : Number(found[3]), via } : { file: text, line: null, column: null, via };
  };
  const sourceOf = (element) => {
    const path = element.getAttribute('data-inspector-relative-path');
    if (path) return { file: path, line: number(element.getAttribute('data-inspector-line')), column: number(element.getAttribute('data-inspector-column')), via: 'react-inspector' };
    const vue = element.getAttribute('data-v-inspector');
    if (vue) return located(vue, 'vue');
    const svelte = element.__svelte_meta && element.__svelte_meta.loc;
    if (svelte && svelte.file) return { file: String(svelte.file), line: number(svelte.line), column: number(svelte.column), via: 'svelte' };
    const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
    if (key) {
      let fiber = element[key];
      for (let depth = 0; fiber && depth < 25; depth += 1, fiber = fiber.return) {
        const debug = fiber._debugSource;
        if (debug && debug.fileName) return { file: String(debug.fileName), line: number(debug.lineNumber), column: number(debug.columnNumber), via: 'react' };
      }
    }
    const component = element.__vueParentComponent;
    if (component && component.type && component.type.__file) return { file: String(component.type.__file), line: null, column: null, via: 'vue' };
    return null;
  };
  const elements = [];
  let truncated = false;
  for (const element of document.body ? document.body.querySelectorAll('*') : []) {
    if (SKIP.has(element.tagName)) continue;
    const svg = element.closest('svg');
    if (svg && svg !== element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (elements.length >= LIMIT) { truncated = true; break; }
    elements.push({
      selector: selectorOf(element),
      tag: element.tagName.toLowerCase(),
      role: roleOf(element),
      text: textOf(element),
      box: { x: Math.round(rect.left + sx), y: Math.round(rect.top + sy), width: Math.round(rect.width), height: Math.round(rect.height) },
      source: sourceOf(element),
    });
  }
  const root = document.documentElement;
  return JSON.stringify({ page: { width: root.scrollWidth, height: Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0) }, elements, truncated });
})()`;
