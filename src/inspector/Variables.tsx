import { ObjectInspector } from "react-inspector";
import { deserializeValue } from "../sugarcube/serialize";
import { useInspector } from "./InspectorContext";

export default function Variables() {
  const { snapshot } = useInspector();

  const variables = useMemo(() => {
    if (!snapshot) return null;

    try {
      return {
        story: deserializeValue(snapshot.variables.story),
        temporary: deserializeValue(snapshot.variables.temporary),
      };
    } catch (error) {
      console.error(
        "[SugarCube Inspector] Failed to deserialize variables:",
        error,
      );

      return null;
    }
  }, [snapshot]);

  if (!snapshot) {
    return (
      <p className="text-sm text-zinc-400">Waiting for SugarCube data...</p>
    );
  }

  if (!variables) {
    return <p className="text-sm text-red-400">Unable to display variables.</p>;
  }

  return (
    <div className="space-y-5 text-xs">
      <section>
        <h2 className="mb-2 text-sm font-medium">Story Variables</h2>

        <ObjectInspector
          name="$"
          data={variables.story}
          theme="chromeDark"
          expandLevel={1}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Temporary Variables</h2>

        <ObjectInspector
          name="_"
          data={variables.temporary}
          theme="chromeDark"
          expandLevel={1}
        />
      </section>
    </div>
  );
}
