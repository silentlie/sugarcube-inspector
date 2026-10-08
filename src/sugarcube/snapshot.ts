import type { SugarCubeObject } from "twine-sugarcube";
import type { SugarCubeSnapshot } from "./types";

import { serializeValue } from "./serialize";

export function createSugarCubeSnapshot({
  State,
  Story,
  version,
}: SugarCubeObject): SugarCubeSnapshot {
  const passage = State.passage;

  return {
    story: {
      name: Story.name || Story.title || "Unknown Story",
      ifId: Story.ifId,
      version: version.toString(),
    },

    passage: {
      name: passage,
      tags: [...Story.get(passage).tags],
    },

    history: {
      turns: State.turns,
      length: State.length,
    },

    variables: {
      story: serializeValue(State.variables),
      temporary: serializeValue(State.temporary),
    },

    capturedAt: Date.now(),
  };
}
