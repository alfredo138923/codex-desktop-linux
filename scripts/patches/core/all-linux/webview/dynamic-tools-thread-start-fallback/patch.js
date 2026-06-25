"use strict";

const {
  applyLinuxDynamicToolsThreadStartFallbackPatch,
} = require("../../../../webview-assets.js");

module.exports = [
  {
    id: "linux-dynamic-tools-thread-start-fallback",
    phase: "webview-asset",
    order: 1043,
    ciPolicy: "optional",
    pattern: /^thread-context-inputs-.*\.js$/,
    missingDescription: "thread context inputs webview bundle",
    skipDescription: "dynamic tools thread/start inputSchema fallback patch",
    apply: applyLinuxDynamicToolsThreadStartFallbackPatch,
  },
];
