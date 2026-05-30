// Client-side helpers for interacting with rendered MathML.

const SCRIPT_CONTAINERS = new Set([
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mroot",
  "mmultiscripts",
]);

const TOKENS = new Set(["mi", "mn", "mo", "mtext", "ms"]);

export function findMathAncestor(el: Element | null): Element | null {
  let node: Element | null = el;
  while (node) {
    if (node.tagName?.toLowerCase() === "math") return node;
    node = node.parentElement;
  }
  return null;
}

/** The LaTeX source of the whole formula, from alttext or the tex annotation. */
export function getFormulaTex(mathEl: Element): string {
  const alt = mathEl.getAttribute("alttext");
  if (alt) return alt;
  const annotation = mathEl.querySelector(
    'annotation[encoding="application/x-tex"]',
  );
  if (annotation?.textContent) return annotation.textContent.trim();
  return (mathEl.textContent || "").trim();
}

/**
 * Given the clicked element inside a formula, find the smallest meaningful
 * "term" node: the nearest token, expanded to its enclosing script container
 * (so clicking either part of d_k selects the whole d_k).
 */
export function findTermNode(
  target: Element,
  mathEl: Element,
): Element | null {
  let node: Element | null = target;
  // Climb to the nearest token element.
  while (node && node !== mathEl && !TOKENS.has(node.tagName.toLowerCase())) {
    node = node.parentElement;
  }
  if (!node || node === mathEl) {
    // Clicked directly on a script container etc.
    node = target;
  }
  // Expand through script containers.
  while (
    node.parentElement &&
    node.parentElement !== mathEl &&
    SCRIPT_CONTAINERS.has(node.parentElement.tagName.toLowerCase())
  ) {
    node = node.parentElement;
  }
  return node;
}

/** Best-effort LaTeX-ish reconstruction for a MathML term node. */
export function mathmlToTex(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const kids = Array.from(node.children) as Element[];

  switch (tag) {
    case "mi":
    case "mn":
    case "mo":
    case "mtext":
    case "ms":
      return (node.textContent || "").trim();
    case "msub":
      return `${wrap(kids[0])}_{${plain(kids[1])}}`;
    case "msup":
      return `${wrap(kids[0])}^{${plain(kids[1])}}`;
    case "msubsup":
      return `${wrap(kids[0])}_{${plain(kids[1])}}^{${plain(kids[2])}}`;
    case "munder":
      return `${wrap(kids[0])}_{${plain(kids[1])}}`;
    case "mover":
      return `${wrap(kids[0])}^{${plain(kids[1])}}`;
    case "msqrt":
      return `\\sqrt{${kids.map(plain).join("")}}`;
    case "mfrac":
      return `\\frac{${plain(kids[0])}}{${plain(kids[1])}}`;
    default:
      return (node.textContent || "").trim();
  }
}

function plain(node?: Element): string {
  if (!node) return "";
  return (node.textContent || "").trim();
}

function wrap(node?: Element): string {
  if (!node) return "";
  const t = plain(node);
  return t.length > 1 ? `{${t}}` : t;
}
