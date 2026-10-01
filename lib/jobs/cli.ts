import { register } from "node:module";

register("./cli-hooks.mjs", import.meta.url);

const { normalizeJob } = await import("./normalize");
console.log(typeof normalizeJob);
