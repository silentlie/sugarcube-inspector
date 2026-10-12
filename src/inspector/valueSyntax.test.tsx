import { renderToStaticMarkup } from "react-dom/server";
import { themes } from "prism-react-renderer";
import { describe, expect, it } from "vitest";
import { inlinePreview, TypeSyntax, ValueSyntax } from "./valueSyntax";

describe("VS Dark syntax highlighting", () => {
  it("reuses the bundled palette for type labels", () => {
    const keyword = themes.vsDark.styles.find(({ types }) => types.includes("keyword"))?.style.color;
    const className = themes.vsDark.styles.find(({ types }) => types.includes("class-name"))?.style.color;

    expect(renderToStaticMarkup(<TypeSyntax type="number" />)).toContain(`color:${keyword}`);
    expect(renderToStaticMarkup(<TypeSyntax type="Map" />)).toContain(`color:${className}`);
  });

  it("highlights JavaScript literals using Prism's tokens", () => {
    const stringHtml = renderToStaticMarkup(<ValueSyntax type="string" preview={'"Alex"'} />);
    expect(stringHtml).toContain('class="token string"');
    expect(stringHtml).toContain('"Alex"');

    const numberHtml = renderToStaticMarkup(<ValueSyntax type="number" preview="42" />);
    expect(numberHtml).toContain('class="token number"');
    expect(numberHtml).toContain("42");

    const arrayHtml = renderToStaticMarkup(<ValueSyntax type="Array" preview="Array(3)" />);
    expect(arrayHtml).toContain('class="token number"');
    expect(arrayHtml).not.toContain("Array");
  });

  it("avoids repeating collection and function type names", () => {
    expect(inlinePreview("Array", "Array(3)")).toBe("(3)");
    expect(inlinePreview("Map", "Map(2)")).toBe("(2)");
    expect(inlinePreview("Set", "Set(1)")).toBe("(1)");
    expect(inlinePreview("Function", "[Function]")).toBe("ƒ");
    expect(inlinePreview("Object", "Object")).toBe("{…}");
    expect(inlinePreview("string", '"Alex"')).toBe('"Alex"');
  });
});
