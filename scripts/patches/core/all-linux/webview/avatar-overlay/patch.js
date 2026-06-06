"use strict";

const {
  applyLinuxAvatarOverlayMascotDragOnlyPatch,
} = require("../../../../webview-assets.js");

module.exports = [
  {
    id: "linux-avatar-overlay-mascot-drag-only",
    phase: "webview-asset",
    order: 1040,
    ciPolicy: "optional",
    pattern: /^avatar-overlay-page-.*\.js$/,
    missingDescription: "avatar overlay webview bundle",
    skipDescription: "mascot-only drag patch",
    apply: applyLinuxAvatarOverlayMascotDragOnlyPatch,
  },
];
