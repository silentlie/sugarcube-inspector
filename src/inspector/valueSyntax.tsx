import { Fragment } from "react";
import { Highlight, themes } from "prism-react-renderer";

/** Type labels reuse the VS Dark palette rather than maintaining custom colors. */
export function TypeSyntax({ type }: { type: string }) {
  const tokenType = /^[A-Z]/.test(type) ? "class-name" : "keyword";
  const color = themes.vsDark.styles.find(({ types }) => types.includes(tokenType))?.style.color;
  return <span className={`token ${tokenType}`} style={{ color }}>{type}</span>;
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

/** Tokenize the displayed JavaScript value with Prism instead of mapping types to CSS classes. */
/* eslint-disable @eslint-react/no-array-index-key -- Prism line/token spans are stateless, ordered presentation; indices are their natural identities. */
export function ValueSyntax({ type, preview }: { type: string; preview: string }) {
  const code = inlinePreview(type, preview);
  // Temporary A/B benchmark switch. Not intended for production.
  if ((globalThis as typeof globalThis & { __SCROLL_BENCH_PLAIN__?: boolean }).__SCROLL_BENCH_PLAIN__) {
    return <span>{code}</span>;
  }
  return (
    <Highlight code={code} language="javascript" theme={themes.vsDark}>
      {({ tokens, getTokenProps }) => (
        <>
          {tokens.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && "\n"}
              {line.map((token, tokenIndex) => (
                <span key={tokenIndex} {...getTokenProps({ token })} />
              ))}
            </Fragment>
          ))}
        </>
      )}
    </Highlight>
  );
}

/* eslint-enable @eslint-react/no-array-index-key */
