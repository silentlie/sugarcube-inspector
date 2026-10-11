import { registerInspectionService } from "@/src/inspection/InspectionService";

export default defineBackground(() => {
  registerInspectionService();
  void browser.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
  }).catch(console.error);
});
