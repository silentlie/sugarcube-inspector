/** Reuse Prism's existing syntax token classes and theme colors. */
export function typeToken(type: string): string {
  return /^[A-Z]/.test(type) ? "class-name" : "keyword";
}

export function valueToken(type: string): string {
  switch (type) {
    case "string": return "string";
    case "number":
    case "bigint":
    case "NaN": return "number";
    case "boolean": return "boolean";
    case "null":
    case "undefined": return "keyword";
    case "symbol": return "symbol";
    case "Function": return "function";
    default: return "punctuation";
  }
}

/** Show the type once: next to the name, rather than also in the preview. */
export function inlinePreview(type: string, preview: string): string {
  if (type === "Array" || type === "Map" || type === "Set") {
    return preview.startsWith(type + "(") ? preview.slice(type.length) : preview;
  }
  if (type === "Function") return "ƒ";
  if (preview === "Object") return "{…}";
  return preview;
}
