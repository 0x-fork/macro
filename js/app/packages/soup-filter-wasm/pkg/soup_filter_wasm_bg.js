/**
 * A compiled soup filter, reusable across many item checks.
 */
export class SoupFilter {
    static __wrap(ptr) {
        const obj = Object.create(SoupFilter.prototype);
        obj.__wbg_ptr = ptr;
        SoupFilterFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SoupFilterFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_soupfilter_free(ptr, 0);
    }
    /**
     * The expanded AST as JSON — the exact body for `POST /items/soup/ast`.
     *
     * Lets the frontend build typed filters once and obtain the canonical
     * AST from the same Rust expansion the backend uses, instead of
     * mirroring the expansion in TypeScript.
     * @returns {string}
     */
    astJson() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.soupfilter_astJson(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Build a filter from a raw AST JSON string — the body shape of
     * `POST /items/soup/ast` (`{"df": ..., "ef": ..., ...}`).
     *
     * `current_user_id` enables requester-dependent predicates (e.g. the
     * task created-by-me filter); pass `undefined` to leave them
     * undecidable.
     * @param {string} ast_json
     * @param {string | null} [current_user_id]
     * @returns {SoupFilter}
     */
    static fromAst(ast_json, current_user_id) {
        const ptr0 = passStringToWasm0(ast_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(current_user_id) ? 0 : passStringToWasm0(current_user_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.soupfilter_fromAst(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return SoupFilter.__wrap(ret[0]);
    }
    /**
     * Build a filter from typed filters JSON — the body shape of
     * `POST /items/soup` (`{"document_filters": ..., ...}`).
     *
     * Expansion runs through the same `EntityFilterAst::new_from_filters`
     * the soup router uses, so malformed filters fail here with the same
     * errors the endpoint would produce.
     * @param {string} filters_json
     * @param {string | null} [current_user_id]
     * @returns {SoupFilter}
     */
    static fromTypedFilters(filters_json, current_user_id) {
        const ptr0 = passStringToWasm0(filters_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(current_user_id) ? 0 : passStringToWasm0(current_user_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.soupfilter_fromTypedFilters(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return SoupFilter.__wrap(ret[0]);
    }
    /**
     * Evaluate one `SoupApiItem` JSON string. Returns a [`Verdict`].
     * @param {string} soup_item_json
     * @returns {Verdict}
     */
    matches(soup_item_json) {
        const ptr0 = passStringToWasm0(soup_item_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.soupfilter_matches(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * Evaluate a JSON array of `SoupApiItem`s in one boundary crossing.
     * Returns one [`Verdict`] code per item, in order.
     * @param {string} soup_items_json
     * @returns {Uint8Array}
     */
    matchesMany(soup_items_json) {
        const ptr0 = passStringToWasm0(soup_items_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.soupfilter_matchesMany(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
}
if (Symbol.dispose) SoupFilter.prototype[Symbol.dispose] = SoupFilter.prototype.free;

/**
 * Verdict codes returned across the JS boundary.
 *
 * Kept as plain numbers so `matchesMany` can return a compact `Uint8Array`.
 * @enum {1 | 0 | 2}
 */
export const Verdict = Object.freeze({
    /**
     * The item definitely matches the filter.
     */
    Match: 1, "1": "Match",
    /**
     * The item definitely does not match the filter.
     */
    NoMatch: 0, "0": "NoMatch",
    /**
     * Locally undecidable — fall back to server reconciliation.
     */
    Unknown: 2, "2": "Unknown",
});
export function __wbg_Error_bce6d499ff0a4aff(arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
}
export function __wbg___wbindgen_throw_9c31b086c2b26051(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
}
export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
}
const SoupFilterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_soupfilter_free(ptr, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
