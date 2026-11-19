import { h, render } from "preact";
import { App } from "./shell.ts";

/*
 * The client app's entry: the second bundle tsdown builds, which the
 * inspector's server serves beside its shell page. It mounts the shell on
 * the page's one element and reads everything else from the contract.
 */

const root = document.getElementById("app");
if (root !== null) {
  root.textContent = "";
  render(h(App, null), root);
}
