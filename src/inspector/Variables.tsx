import { ObjectInspector } from "react-inspector";
import type { SugarCubeSnapshot } from "../sugarcube/types";

interface VariablesProps {
  snapshot: SugarCubeSnapshot;
}

export default function Variables({ snapshot }: VariablesProps) {
  if (!snapshot) {
    return (
      <p className="text-sm text-zinc-400">Waiting for SugarCube data...</p>
    );
  }

  return (
    <div className="space-y-5 text-xs">
      <section>
        <h2 className="mb-2 text-sm font-medium">Story Variables</h2>

        <ObjectInspector
          name="$"
          data={snapshot.variables.story}
          theme="chromeDark"
          expandLevel={1}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Temporary Variables</h2>

        <ObjectInspector
          name="_"
          data={snapshot.variables.temporary}
          theme="chromeDark"
          expandLevel={1}
        />
      </section>
    </div>
  );
}
