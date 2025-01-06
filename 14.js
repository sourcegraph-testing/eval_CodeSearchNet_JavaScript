"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var array_1 = require("./array");
var from_1 = require("./from");
var is_1 = require("./is");
var object_1 = require("./object");
var function_1 = require("./function");
var string_1 = require("./string");
function toArray(val, id, def) {
    if (is_1.isArray(id)) {
        def = id;
        id = undefined;
    }
    if (!is_1.isValue(val))
        return toDefault(null, def || []);
    if (is_1.isArray(val))
        return val;
    var ARRAY_LIKE_EXP = /^(.+(,|\||\s).+){1,}$/;
    // id = id || '$id';
    if (is_1.isPlainObject(val) && id) {
        var arr = [];
        for (var p in val) {
            if (val.hasOwnProperty(p)) {
                var cur = val[p];
                if (is_1.isPlainObject(cur)) {
                    var tmp = {};
                    tmp[id] = p;
                    var obj = Object.assign({}, cur, tmp);
                    arr = array_1.push(arr, obj).array;
                }
                else {
                    arr = array_1.push(arr, val).array;
                }
            }
        }
        return arr;
    }
    if (is_1.isString(val) && ARRAY_LIKE_EXP.test(val)) {
        var arr = string_1.split(val);
        return arr;
    }
    return [val];
}
exports.toArray = toArray;
/**
 * To Boolean
 * Converts value if not boolean to boolean.
 * Will convert 'true', '1', 'yes' or '+' to true.
 *
 * @param val the value to inspect.
 * @param def optional default value on null.
 */
function toBoolean(val, def) {
    if (is_1.isBoolean(val))
        return val;
    if (!is_1.isValue(val))
        return toDefault(null, def);
    val = val.toString();
    return (parseFloat(val) > 0 ||
        is_1.isInfinite(val) ||
        val === 'true' ||
        val === 'yes' ||
        val === '1' ||
        val === '+');
}
exports.toBoolean = toBoolean;
/**
 * To Date
 * Converts value to date using Date.parse when string.
 * Optionally you can pass a format object containing
 * Intl.DateFormatOptions and locales. You may also pass
 * the timezone ONLY as a string. In this case locale en-US
 * is assumed.
 *
 * @param val the value to be converted to date.
 * @param format date locale format options.
 * @param def a default date when null.
 */
function toDate(val, format, def) {
    if (is_1.isDate(format)) {
        def = format;
        format = undefined;
    }
    var opts = format;
    // Date format options a simple timezine
    // ex: 'America/Los_Angeles'.
    if (is_1.isString(opts)) {
        opts = {
            timeZone: format
        };
    }
    // This just checks loosely if string is
    // date like string, below parse should
    // catch majority of scenarios.
    function canParse() {
        return !/^[0-9]+$/.test(val) &&
            (is_1.isString(val) && /[0-9]/g.test(val) &&
                /(\.|\/|-|:)/g.test(val));
    }
    function parseDate() {
        var epoch = Date.parse(val);
        if (!isNaN(epoch)) {
            var date = from_1.fromEpoch(epoch);
            if (opts) {
                opts.locales = opts.locales || 'en-US';
                date = new Date(date.toLocaleString(opts.locales, opts));
            }
            return date;
        }
        return toDefault(null, def);
    }
    if (is_1.isDate(val))
        return val;
    if (!canParse())
        return toDefault(null, def);
    return function_1.tryWrap(parseDate)(def);
}
exports.toDate = toDate;
/**
 * To Default
 * Returns a default value when provided if
 * primary value is null or undefined. If neither
 * then null is returned.
 *
 * @param val the value to return if defined.
 * @param def an optional default value to be returned.
 */
function toDefault(val, def) {
    if (is_1.isValue(val) && !(is_1.isEmpty(val) && !is_1.isEmpty(def)))
        return val;
    return is_1.isValue(def) ? def : null;
}
exports.toDefault = toDefault;
/**
 * To Epoch
 * Converts a Date type to an epoch.
 *
 * @param val the date value to convert.
 * @param def optional default value when null.
 */
function toEpoch(val, def) {
    return toDefault((is_1.isDate(val) && val.getTime()), def);
}
exports.toEpoch = toEpoch;
/**
 * To Float
 * Converts value to a float.
 *
 * @param val the value to convert to float.
 */
function toFloat(val, def) {
    if (is_1.isFloat(val))
        return val;
    if (!is_1.isValue(val))
        return toDefault(null, def);
    var parsed = function_1.tryWrap(parseFloat, val)(def);
    if (is_1.isFloat(parsed) || is_1.isNumber(parsed))
        return parsed;
    if (toBoolean(val))
        return 1;
    return 0;
}
exports.toFloat = toFloat;
/**
 * To JSON
 * Simple wrapper to strinigy using JSON.
 *
 * @param obj the object to be stringified.
 * @param pretty an integer or true for tabs in JSON.
 * @param def optional default value on null.
 */
function toJSON(obj, pretty, def) {
    if (is_1.isString(pretty)) {
        def = pretty;
        pretty = undefined;
    }
    var tabs = 0;
    pretty = is_1.isBoolean(pretty) ? 2 : pretty;
    tabs = pretty ? pretty : tabs;
    if (!is_1.isObject(obj))
        return toDefault(null, def);
    return function_1.tryWrap(JSON.stringify, obj, null, tabs)(def);
}
exports.toJSON = toJSON;
/**
 * To Integer
 * Convert value to integer.
 *
 * @param val the value to convert to integer.
 * @param def optional default value on null or error.
 */
function toInteger(val, def) {
    if (!is_1.isValue(val))
        return toDefault(null, def);
    var parsed = function_1.tryWrap(parseInt, val)(def);
    if (is_1.isInteger(parsed))
        return parsed;
    if (toBoolean(val))
        return 1;
    return 0;
}
exports.toInteger = toInteger;
/**
 * To Map
 * Converts arrays, strings, to an object literal.
 *
 * @example
 * Array: ['one', 'two', 'three'] Maps To: { 0: 'one', 1: 'two', 2: 'three' }
 * String: 'Star Wars' Maps To: { 0: 'Star Wars' }
 * String: 'Star Wars, Star Trek' Maps To { 0: 'Star Wars', 1: 'Star Trek' }
 * Array: [{ id: '123', name: 'Joe' }] Maps To: { 123: { name: 'Joe' }}
 * Array: [{ name: 'Joe' }, { name: 'Amy' }]
 * Maps To: { 0: { name: 'Joe' }, 2: { name: 'Amy' }}
 *
 * NOTE: mixed content arrays not supported.
 *
 * @param val the value to be mapped.
 * @param id optional id key when iterating array of objects.
 * @param def optional default value on null or error.
 */
function toMap(val, id, def) {
    if (is_1.isValue(id) && !is_1.isString(id)) {
        def = id;
        id = undefined;
    }
    if (is_1.isPlainObject(val))
        return val;
    if (!is_1.isValue(val) || (!is_1.isString(val) && !is_1.isArray(val)))
        return toDefault(null, def);
    // Default id key.
    id = id || '$id';
    var exp = /(\/|\.|,|;|\|)/g;
    var i = 0;
    var obj = {};
    if (is_1.isString(val)) {
        // simple string.
        if (!exp.test(val))
            return { 0: val };
        // split string into array, iterate.
        val = string_1.split(val);
        val.forEach(function (v, i) { return obj[i] = v; });
        return obj;
    }
    while (i < val.length) {
        if (is_1.isString(val[i])) {
            obj[i] = val[i];
        }
        else if (is_1.isPlainObject(val[i])) {
            var itm = Object.assign({}, val[i]);
            var key = itm[id] ? itm[id] : i;
            obj[key] = itm[id] ? object_1.del(itm, id) : itm;
        }
        i++;
    }
    return obj;
}
exports.toMap = toMap;
/**
 * To Nested
 * Takes an object that was flattened by toUnnested
 * and re-nests it.
 *
 * @param val the flattened object to be nested.
 */
function toNested(val, def) {
    function nest(src) {
        var dest = {};
        for (var p in src) {
            if (src.hasOwnProperty(p))
                if (/\./g.test(p))
                    object_1.set(dest, p, src[p]);
                else
                    dest[p] = src[p];
        }
        return dest;
    }
    return function_1.tryWrap(nest, val)(def);
}
exports.toNested = toNested;
/**
 * To Number
 * Converts value to number.
 *
 * @param val the value to convert to number.
 * @param def optional default value on null.
 */
function toNumber(val, def) {
    return toFloat(val);
}
exports.toNumber = toNumber;
/**
 * To Regular Expression
 * Attempts to convert to a regular expression
 * from a string.
 *
 * @param val the value to convert to RegExp.
 * @param def optional express as default on null.
 */
function toRegExp(val, def) {
    var exp = /^\/.+\/(g|i|m)?([m,i,u,y]{1,4})?/;
    var optsExp = /(g|i|m)?([m,i,u,y]{1,4})?$/;
    if (is_1.isRegExp(val))
        return val;
    if (!is_1.isValue(val) || !is_1.isString(val))
        return toDefault(null, def);
    function regExpFromStr() {
        var opts;
        if (exp.test(val)) {
            opts = optsExp.exec(val)[0];
            val = val.replace(/^\//, '').replace(optsExp, '').replace(/\/$/, '');
        }
        return new RegExp(val, opts);
    }
    return function_1.tryWrap(regExpFromStr)(def);
}
exports.toRegExp = toRegExp;
/**
 * To String
 * When not null or undefined calls to string method on object.
 *
 * @param val the value to convert to string.
 * @param def optional default value on null.
 */
function toString(val, def) {
    if (is_1.isString(val))
        return val;
    if (!is_1.isValue(val))
        return toDefault(null, def);
    function _toString() {
        return val.toString();
    }
    return function_1.tryWrap(_toString)(def);
}
exports.toString = toString;
/**
 * To Unnested
 * Takes a nested object and flattens it
 * to a single level safely. To disable key
 * prefixing set prefix to false.
 *
 * @param val the object to be unnested.
 * @param prefix when NOT false parent key is prefixed to children.
 * @param def optional default value on null.
 */
function toUnnested(obj, prefix, def) {
    if (is_1.isValue(prefix) && !is_1.isBoolean(prefix)) {
        def = prefix;
        prefix = undefined;
    }
    var dupes = 0;
    function unnest(src, dest, pre) {
        dest = dest || {};
        for (var p in src) {
            if (dupes > 0)
                return;
            if (src.hasOwnProperty(p)) {
                if (is_1.isPlainObject(src[p])) {
                    var parent = prefix !== false &&
                        (pre && pre.length) ?
                        pre + '.' + p : p;
                    unnest(src[p], dest, parent);
                }
                else {
                    var name = prefix !== false &&
                        pre && pre.length ?
                        pre + '.' + p : p;
                    if (dest[name])
                        dupes += 1;
                    else
                        dest[name] = src[p];
                }
            }
        }
        if (dupes > 0)
            return null;
        return dest;
    }
    return function_1.tryWrap(unnest, object_1.clone(obj))(def);
}
exports.toUnnested = toUnnested;
/**
 * To Window
 * Adds key to window object if is browser.
 *
 * @param key the key or object to add to the window object.
 * @param val the corresponding value to add to window object.
 * @param exclude string or array of keys to exclude.
 */
function toWindow(key, val, exclude) {
    /* istanbul ignore if */
    if (!is_1.isBrowser())
        return;
    exclude = toArray(exclude);
    var _keys, i;
    // key/val was passed.
    if (is_1.isString(key)) {
        if (!is_1.isPlainObject(val)) {
            window[key] = val;
        }
        else {
            var obj = {};
            _keys = array_1.keys(val);
            i = _keys.length;
            while (i--) {
                if (!array_1.contains(exclude, _keys[i]))
                    obj[_keys[i]] = val[_keys[i]];
            }
            window[key] = obj;
        }
    }
    // object passed to key.
    else if (is_1.isPlainObject(key)) {
        _keys = array_1.keys(key);
        i = _keys.length;
        while (i--) {
            if (!array_1.contains(exclude, _keys[i]))
                window[_keys[i]] = key[_keys[i]];
        }
    }
}
exports.toWindow = toWindow;
//# sourceMappingURL=to.js.map