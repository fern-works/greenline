import type { CliWriter } from "../../src/shell/cli/output.ts";

/** A CliWriter that records every chunk for assertion. */
export class RecordingWriter {
  public out: string = "";
  public err: string = "";
  public readonly writer: CliWriter;

  public constructor() {
    this.writer = {
      stdout: {
        write: (chunk: string): void => {
          this.out += chunk;
        },
      },
      stderr: {
        write: (chunk: string): void => {
          this.err += chunk;
        },
      },
    };
  }
}
