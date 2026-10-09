import type { SugarCubeSnapshot } from "../src/sugarcube/types";

export function createSnapshotFixture(
  passageName = "Start",
): SugarCubeSnapshot {
  return {
    story: {
      name: "Test Story",
      ifId: "8A6E4307-C73B-4F1B-9322-7CF69B980FB1",
      version: "2.37.3",
    },
    passage: {
      name: passageName,
      tags: ["intro"],
    },
    history: {
      turns: 2,
      length: 2,
    },
    variables: {
      story: { score: 7, inventory: ["map"] },
      temporary: { choice: "north" },
    },
    capturedAt: 1_791_500_000_000,
  };
}

export function createSugarCubeFixture() {
  const snapshot = createSnapshotFixture();
  return {
    State: {
      passage: snapshot.passage.name,
      turns: snapshot.history.turns,
      length: snapshot.history.length,
      variables: { ...snapshot.variables.story } as Record<string, unknown>,
      temporary: { ...snapshot.variables.temporary } as Record<string, unknown>,
    },
    Story: {
      name: snapshot.story.name,
      title: snapshot.story.name,
      ifId: snapshot.story.ifId,
      get: () => ({
        tags: [...snapshot.passage.tags],
      }),
    },
    version: { toString: () => snapshot.story.version },
  };
}
