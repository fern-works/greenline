/** A credential whose ordinary string and JSON representations never reveal its value. */
export class Redacted<T> {
  readonly #value: T;
  constructor(value: T) {
    this.#value = value;
  }
  /** Reveal only at the adapter boundary that needs the credential. */
  reveal(): T {
    return this.#value;
  }
  /** Keep implicit string formatting safe for diagnostics. */
  toString(): string {
    return "[redacted]";
  }
  /** Keep structured configuration diagnostics safe. */
  toJSON(): string {
    return "[redacted]";
  }
}
