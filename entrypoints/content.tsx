import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import ScopedCssBaseline from "@mui/material/ScopedCssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Drawer from "@/src/inspector/Drawer";
import DirectInspector from "@/src/inspector/DirectInspector";
import ReactDOM from "react-dom/client";
import syntaxTheme from "prism-themes/themes/prism-vsc-dark-plus.css?inline";

/** SugarCube and React share MAIN world; MUI styles remain in the ShadowRoot. */
export default defineContentScript({
  matches: ["file:///*"],
  world: "MAIN",
  runAt: "document_idle",

  main() {
    if (!document.querySelector('tw-storydata[format="SugarCube"]')) return;
    if (document.querySelector("sugarcube-inspector")) return;

    const host = document.createElement("sugarcube-inspector");
    host.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    const styles = document.createElement("style");
    styles.textContent = syntaxTheme;
    shadow.append(styles, container);
    document.documentElement.append(host);

    const cache = createCache({ key: "sugarcube-mui", prepend: true, container: shadow });
    const theme = createTheme({
      palette: { mode: "dark" },
      components: {
        MuiModal: { defaultProps: { container } },
        MuiPopover: { defaultProps: { container } },
        MuiPopper: { defaultProps: { container } },
      },
    });

    ReactDOM.createRoot(container).render(
      <CacheProvider value={cache}>
        <ThemeProvider theme={theme}>
          <ScopedCssBaseline enableColorScheme>
            <Drawer initialWidth={380}>
              <DirectInspector />
            </Drawer>
          </ScopedCssBaseline>
        </ThemeProvider>
      </CacheProvider>,
    );
  },
});
