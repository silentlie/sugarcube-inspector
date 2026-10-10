import type { SugarCubeObject } from "twine-sugarcube";
import { browser } from "wxt/browser";

export type DetectionState =
  | { status: "checking" }
  | { status: "not-local" }
  | { status: "not-detected" }
  | {
      status: "detected";
      storyName?: string;
      ifid?: string;
      passage?: string;
    }
  | {
      status: "error";
      message: string;
    };

export async function readDetection(): Promise<DetectionState> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || tab.id == null) {
    return {
      status: "error",
      message: "No active tab found.",
    };
  }

  if (!tab.url?.startsWith("file://")) {
    return {
      status: "not-local",
    };
  }

  const [result] = await browser.scripting.executeScript({
    target: {
      tabId: tab.id,
    },
    world: "MAIN",
    func: () => {
      const page = globalThis as typeof globalThis & {
        SugarCube?: SugarCubeObject;
      };

      const sc = page.SugarCube;

      if (!sc?.State) {
        return {
          detected: false,
        };
      }

      const storyData = document.querySelector("tw-storydata");

      return {
        detected: true,

        storyName:
          sc.Story?.name ??
          sc.Story?.title ??
          storyData?.getAttribute("name") ??
          document.title,

        ifid: sc.Story?.ifId ?? storyData?.getAttribute("ifid") ?? "",

        passage: sc.State?.passage ?? "",

      };
    },
  });

  const info = result?.result;

  if (!info?.detected) {
    return {
      status: "not-detected",
    };
  }

  return {
    status: "detected",
    storyName: info.storyName,
    ifid: info.ifid,
    passage: info.passage,
  };
}

