import Drawer from "@/src/inspector/Drawer";
import InspectorDrawer from "@/src/inspector/InspectorDrawer";
import "@/src/styles/tailwind.css";
import ReactDOM from "react-dom/client";

export default defineContentScript({
  matches: ["file:///*"],
  cssInjectionMode: "ui",
  runAt: "document_idle",

  async main(ctx) {
    if (!document.querySelector('tw-storydata[format="SugarCube"]')) return;
    const ui = await createShadowRootUi(ctx, {
      name: "sugarcube-inspector",
      position: "overlay",
      alignment: "top-right",
      zIndex: 2147483647,
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(
          <Drawer initialWidth={380}>
            <InspectorDrawer />
          </Drawer>,
        );
        return root;
      },
      onRemove(root) { root?.unmount(); },
    });
    ui.mount();
  },
});
