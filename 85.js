#!/usr/bin/env node

(function(global) {

var USAGE = _multiline(function() {/*
    Usage:
        node bin/Watch.js [--help]
                          [--verbose]
                          [--action script]
                          [--delay n]
                          watch-target-file [watch-target-file ...]

    See:
        https://github.com/uupaa/Watch.js/wiki/Watch
*/});

var CONSOLE_COLOR = {
        RED:    "\u001b[31m",
        YELLOW: "\u001b[33m",
        CLEAR:  "\u001b[0m"
    };

var fs      = require("fs");
var Watch   = require("../lib/Watch");
var Process = require("child_process");
var argv    = process.argv.slice(2);
var pkg      = _loadCurrentDirectoryPackageJSON();
var options = _parseCommandLineOptions(argv, {
        help:   false,               // show help
        source: pkg.source,          // WatchTargetPathStringArray: [dir, file, ...]
        delay:  1000,                // delay time (unit ms)
        action: "",                  // npm run {{action}}
        verbose: false,              // verbose
        ignoreDir: [".watchignore"]  // ignore dir name
    });

if (options.help) {
    console.log(CONSOLE_COLOR.YELLOW + USAGE + CONSOLE_COLOR.CLEAR);
    return;
}
if (!options.source.length) {
    console.log(CONSOLE_COLOR.RED + "Input files are empty." + CONSOLE_COLOR.CLEAR);
    return;
}

Watch(options.source, {
    "delay":     options.delay,
    "action":    options.action,
    "verbose":   options.verbose,
    "ignoreDir": options.ignoreDir
}, function(err) { // @arg Error:
    if (!err) {
        var command = "npm run " + options.action;

        Process.exec(command, function(err, stdout, stderr) {
                        if (options.verbose) {
                            console.log(CONSOLE_COLOR.YELLOW + "  command: " + CONSOLE_COLOR.CLEAR + command);
                        }
                     });
    }
});

function _loadCurrentDirectoryPackageJSON() {
    var path   = "./package.json";
    var json   = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
    var build  = json["x-build"] || json["build"] || {};
    var source = build.source || build.inputs || build.files || [];
    var output = build.output || "";

    return { source: source, output: output };
}

function _parseCommandLineOptions(argv, options) {
    for (var i = 0, iz = argv.length; i < iz; ++i) {
        switch (argv[i]) {
        case "-h":
        case "--help":      options.help = true; break;
        case "-v":
        case "--verbose":   options.verbose = true; break;
        case "--delay":     options.delay = argv[++i]; break;
        case "--action":    options.action = argv[++i]; break;
        default:
            var path = argv[i];

            if (fs.existsSync(path) && fs.statSync(path).isFile()) {
                if (options.source.indexOf(path) < 0) { // avoid duplicate
                    options.source.push(path);
                }
            } else if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
                path = path.replace(/\/+$/, "") + "/"; // supply tail slash. "path" -> "path/"

                if (options.source.indexOf(path) < 0) { // avoid duplicate
                    options.source.push(path);
                }
            } else {
                console.log(CONSOLE_COLOR.RED + "invalid path: " + path + CONSOLE_COLOR.CLEAR);
            }
        }
    }
    return options;
}

function _multiline(fn) { // @arg Function:
                          // @ret String:
    return (fn + "").split("\n").slice(1, -1).join("\n");
}

})((this || 0).self || global);

