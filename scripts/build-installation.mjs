import { resolve, join } from "node:path";
import { rmSync } from "node:fs";
import { compileInstallation } from "../src/shell/installation.ts";
import { atomicWriteFile } from "../src/shell/fs/io.ts";

const result = compileInstallation(resolve("corpus"));
if (result._tag === "err") {
  process.stderr.write(JSON.stringify(result.error.issues) + "\n");
  process.exitCode = 1;
} else {
  const directory = resolve("dist/corpus");
  rmSync(directory, { recursive: true, force: true });
  const write = atomicWriteFile(
    join(directory, "installation.json"),
    JSON.stringify(result.value) + "\n",
  );
  if (write._tag === "err") {
    process.stderr.write(write.error.message + "\n");
    process.exitCode = 1;
  } else
    process.stdout.write(
      `Built installation ${result.value.revision} (${result.value.skills.length} skills, no guidance payload).\n`,
    );
}
