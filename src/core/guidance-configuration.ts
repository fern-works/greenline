/**
 * A canonical provider endpoint: HTTPS, or HTTP on a loopback host, without
 * credentials, query parameters or a fragment, and with a trailing slash;
 * undefined otherwise. The garden connector's endpoint and a receipt's
 * origin are read through it.
 */
export function providerUrl(input: string): string | undefined {
  try {
    const url = new URL(input);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined;
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  } catch {
    return undefined;
  }
}
