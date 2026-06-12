/* @ts-self-types="./soup_filter_wasm.d.ts" */
import * as wasm from "./soup_filter_wasm_bg.wasm";
import { __wbg_set_wasm } from "./soup_filter_wasm_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    SoupFilter, Verdict
} from "./soup_filter_wasm_bg.js";
