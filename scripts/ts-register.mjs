// Registers ./ts-resolve.mjs. Separate file because hooks must be installed
// before the entry module's imports are resolved.
import { register } from "node:module";
register("./ts-resolve.mjs", import.meta.url);
