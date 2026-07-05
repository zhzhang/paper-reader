import DOMMatrixPolyfill from "@thednp/dommatrix";

globalThis.DOMMatrix = DOMMatrixPolyfill as typeof globalThis.DOMMatrix;
