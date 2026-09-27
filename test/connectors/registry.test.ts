import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GardenConfigurationRefused,
  parseGardenConfiguration,
  type GardenConfiguration,
} from "../../src/core/connectors/garden.ts";
import {
  ConnectorExclusionConflict,
  ConnectorInvocationRefused,
  UnknownConnector,
  connectorStatuses,
  disableConnector,
  enableConnector,
  isSkillMounted,
  parseConnectorId,
  planConnectorInvocation,
  projectConnectorReceipt,
} from "../../src/core/connectors/registry.ts";
import { fixtureSkills } from "../fixtures/corpus.ts";
import { useGarden } from "./workspace.ts";

const garden: GardenConfiguration = {
  endpoint: "https://garden.example/",
  executable: "garden",
};
const noChoices = { include: [], exclude: [] };

describe("the connector registry", () => {
  it("refuses an unknown connector id, a misspelling and anything offered as a plugin", () => {
    for (const input of [
      "gardn",
      "Garden",
      "garden ",
      "",
      "./plugins/garden.mjs",
      "/usr/local/lib/connector.js",
      "npm:@example/connector",
      "garden@1.0.0",
    ]) {
      const parsed = parseConnectorId(input);
      expect(parsed._tag).toBe("err");
      if (parsed._tag !== "err") continue;
      expect(parsed.error).toBeInstanceOf(UnknownConnector);
      expect(parsed.error._tag).toBe("UnknownConnector");
      expect(parsed.error.input).toBe(input);
      expect(parsed.error.message).toContain("no plugin is discovered or loaded");
    }
  });

  it("resolves the one registered id, garden, exactly", () => {
    expect(parseConnectorId("garden")).toEqual({ _tag: "ok", value: "garden" });
  });

  it("lists garden as disabled while the manifest holds no entry for it", () => {
    expect(connectorStatuses({}).map((status) => [status.id, status.state])).toEqual([
      ["garden", "disabled"],
    ]);
  });

  it("mounts the connector's skill only while its connector is enabled, and never over an exclusion", () => {
    expect(isSkillMounted(useGarden, noChoices, {})).toBe(false);
    expect(isSkillMounted(useGarden, { include: ["use-garden"], exclude: [] }, {})).toBe(false);
    expect(isSkillMounted(useGarden, noChoices, { garden })).toBe(true);
    expect(isSkillMounted(useGarden, { include: [], exclude: ["use-garden"] }, { garden })).toBe(
      false,
    );
  });

  it("leaves every other skill to the manifest's own choices", () => {
    const [review] = fixtureSkills;
    if (review === undefined) throw new Error("fixture skill missing");
    expect(isSkillMounted(review, noChoices, {})).toBe(true);
    expect(isSkillMounted(review, { include: [], exclude: [review.name] }, { garden })).toBe(false);
  });

  it("enables garden into the map and refuses while skills.exclude names use-garden", () => {
    expect(enableConnector("garden", garden, noChoices, {})).toEqual({
      _tag: "ok",
      value: { garden },
    });
    const refused = enableConnector("garden", garden, { include: [], exclude: ["use-garden"] }, {});
    expect(refused._tag).toBe("err");
    if (refused._tag !== "err") return;
    expect(refused.error).toBeInstanceOf(ConnectorExclusionConflict);
    expect(refused.error._tag).toBe("ConnectorExclusionConflict");
    expect(refused.error.connector).toBe("garden");
    expect(refused.error.skill).toBe("use-garden");
  });

  it("disables garden by removing its entry, and leaves a disabled garden disabled", () => {
    expect(disableConnector("garden", { garden })).toEqual({});
    expect(disableConnector("garden", {})).toEqual({});
  });
});

describe("garden's configuration", () => {
  const url = "https://garden.example/";

  it("accepts the garden command or an absolute path of either platform as the executable", () => {
    for (const executable of [
      "garden",
      "/opt/garden/bin/garden",
      "C:\\Tools\\garden.exe",
      "D:/garden",
      "\\\\server\\tools\\garden.exe",
    ])
      expect(parseGardenConfiguration({ url, executable })).toEqual({
        _tag: "ok",
        value: { endpoint: url, executable },
      });
  });

  it("refuses a relative path, another command name and a control character as the executable", () => {
    for (const executable of ["./garden", "bin/garden", "garden-dev", "", "/opt/garden\n--url=x"]) {
      const refused = parseGardenConfiguration({ url, executable });
      expect(refused._tag).toBe("err");
      if (refused._tag !== "err") continue;
      expect(refused.error).toBeInstanceOf(GardenConfigurationRefused);
      expect(refused.error.flag).toBe("--executable");
    }
  });

  it("builds the entry from the flags, the executable defaulting to garden on the PATH", () => {
    expect(
      parseGardenConfiguration({ url: "https://garden.example", executable: undefined }),
    ).toEqual({ _tag: "ok", value: { endpoint: "https://garden.example/", executable: "garden" } });
    expect(
      parseGardenConfiguration({ url: "http://127.0.0.1:4100/", executable: "/opt/garden" }),
    ).toEqual({
      _tag: "ok",
      value: { endpoint: "http://127.0.0.1:4100/", executable: "/opt/garden" },
    });
    expect(parseGardenConfiguration({ url: "http://[::1]:4100/", executable: undefined })).toEqual({
      _tag: "ok",
      value: { endpoint: "http://[::1]:4100/", executable: "garden" },
    });
  });

  it("refuses an endpoint carrying a credential, a query or a fragment, or plain HTTP off loopback", () => {
    for (const url of [
      "https://reader:secret@garden.example/",
      "https://garden.example/?key=secret",
      "https://garden.example/#key",
      "http://garden.example/",
      // garden takes loopback to be 127.0.0.0/8 or [::1], never the name.
      "http://localhost:4100/",
      "garden.example",
    ]) {
      const refused = parseGardenConfiguration({ url, executable: undefined });
      expect(refused._tag).toBe("err");
      if (refused._tag !== "err") continue;
      expect(refused.error).toBeInstanceOf(GardenConfigurationRefused);
      expect(refused.error.flag).toBe("--url");
    }
  });
});

describe("the bounded invocation policy", () => {
  it("plans garden's own executable with literal arguments, no shell and the 2 MiB stdout cap", () => {
    const planned = planConnectorInvocation(
      "garden",
      { garden: { ...garden, executable: "/opt/garden/bin/garden" } },
      ["read", "--id", "a unit; rm -rf /", "$(whoami)"],
      30_000,
      "posix",
    );
    expect(planned).toEqual({
      _tag: "ok",
      value: {
        executable: "/opt/garden/bin/garden",
        args: ["read", "--id", "a unit; rm -rf /", "$(whoami)"],
        shell: false,
        stdoutLimitBytes: 2_097_152,
        deadlineMs: 30_000,
      },
    });
  });

  it("runs the garden command on the PATH on either platform, and each platform's own absolute paths", () => {
    const executable = (path: string, platform: "posix" | "win32"): string | undefined => {
      const planned = planConnectorInvocation(
        "garden",
        { garden: { ...garden, executable: path } },
        ["capabilities"],
        1_000,
        platform,
      );
      return planned._tag === "ok" ? planned.value.executable : undefined;
    };
    expect(executable("garden", "posix")).toBe("garden");
    expect(executable("garden", "win32")).toBe("garden");
    expect(executable("/opt/garden/bin/garden", "posix")).toBe("/opt/garden/bin/garden");
    expect(executable("C:\\Tools\\garden.exe", "win32")).toBe("C:\\Tools\\garden.exe");
    expect(executable("\\\\server\\tools\\garden.exe", "win32")).toBe(
      "\\\\server\\tools\\garden.exe",
    );
  });

  it("refuses a disabled connector, a path relative on this platform, an argument holding NUL and a deadline outside 1 to 30,000 ms", () => {
    const windowsPath = (path: string) => ({ garden: { ...garden, executable: path } });
    const refusals = [
      planConnectorInvocation("garden", {}, ["capabilities"], 1_000, "posix"),
      // On POSIX these name a file under the current directory, which the repository controls.
      planConnectorInvocation("garden", windowsPath("D:/garden"), ["capabilities"], 1_000, "posix"),
      planConnectorInvocation(
        "garden",
        windowsPath("C:\\Tools\\garden.exe"),
        ["capabilities"],
        1_000,
        "posix",
      ),
      planConnectorInvocation(
        "garden",
        windowsPath("\\\\server\\garden.exe"),
        ["capabilities"],
        1_000,
        "posix",
      ),
      planConnectorInvocation("garden", { garden }, ["read", "--id", "a\u0000b"], 1_000, "posix"),
      planConnectorInvocation("garden", { garden }, ["read"], 30_001, "posix"),
      planConnectorInvocation("garden", { garden }, ["read"], 0, "posix"),
      planConnectorInvocation("garden", { garden }, ["read"], 1.5, "posix"),
    ];
    for (const refused of refusals) {
      expect(refused._tag).toBe("err");
      if (refused._tag !== "err") continue;
      expect(refused.error).toBeInstanceOf(ConnectorInvocationRefused);
      expect(refused.error._tag).toBe("ConnectorInvocationRefused");
      expect(refused.error.connector).toBe("garden");
    }
  });
});

describe("the adapter-approved receipt projection", () => {
  const fixtures = join(import.meta.dirname, "../../contracts/garden/fixtures");
  const documents = readdirSync(fixtures).map((name) => ({
    name,
    value: z
      .record(z.string(), z.json())
      .parse(JSON.parse(readFileSync(join(fixtures, name), "utf8"))),
  }));

  it("keeps every field of garden's result but the result itself, for each copied fixture", () => {
    for (const { name, value } of documents) {
      const projected = projectConnectorReceipt("garden", value);
      expect(Object.keys(projected).sort(), name).toEqual(
        Object.keys(value)
          .filter((key) => key !== "result")
          .sort(),
      );
      expect(projected["delivery"], name).toEqual(value["delivery"]);
    }
  });

  it("carries no unit text into a receipt", () => {
    const read = documents.find(({ name }) => name === "success-read.json");
    if (read === undefined) throw new Error("success-read.json missing");
    const serialized = JSON.stringify(projectConnectorReceipt("garden", read.value));
    expect(serialized).not.toContain("Synthetic text");
    expect(serialized).not.toContain('"content"');
    expect(serialized).toContain("example-rule");
  });
});
