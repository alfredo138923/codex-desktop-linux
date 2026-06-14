"use strict";

const {
  escapeRegExp,
  findMatchingBrace,
  requireName,
} = require("./shared.js");
const { recordStrategy } = require("./strategy-telemetry.js");

function findAvatarMethod(source, signatureRegex) {
  const match = source.match(signatureRegex);
  if (match == null) {
    return null;
  }
  const openIndex = match.index + match[0].length - 1;
  const closeIndex = findMatchingBrace(source, openIndex);
  if (closeIndex === -1) {
    return null;
  }
  return {
    match,
    start: match.index,
    end: closeIndex + 1,
    text: source.slice(match.index, closeIndex + 1),
  };
}

function replaceAvatarMethod(source, signatureRegex, replacement) {
  const method = findAvatarMethod(source, signatureRegex);
  if (method == null || method.text === replacement) {
    return source;
  }
  return source.slice(0, method.start) + replacement + source.slice(method.end);
}

const mascotInputRegionMethod =
  "codexLinuxMascotInputRegion(e){let t=e.mascot,n=this.codexLinuxMascotShape;if(n!=null&&Number.isFinite(n.width)&&Number.isFinite(n.height)){let e=Number.isFinite(n.left)?n.left:0,r=Number.isFinite(n.top)?n.top:0;return{left:t.left+e,top:t.top+r,width:n.width,height:n.height}}return t}";

function avatarCursorRegionPatch(electronVar) {
  return `codexLinuxIsCursorInAvatarInteractiveRegion(e){let t=this.layout;if(t==null)return!1;let __codexCursor=${electronVar}.screen.getCursorScreenPoint(),__codexBounds=e.getContentBounds(),__codexX=__codexCursor.x-__codexBounds.x,__codexY=__codexCursor.y-__codexBounds.y,__codexWindowHit=__codexX>=0&&__codexY>=0&&__codexX<=__codexBounds.width&&__codexY<=__codexBounds.height;if(!__codexWindowHit)return!1;let __codexHit=e=>e!=null&&__codexX>=e.left&&__codexX<=e.left+e.width&&__codexY>=e.top&&__codexY<=e.top+e.height;return __codexHit(this.codexLinuxMascotInputRegion(t))||this.traySize!=null&&__codexHit(t.tray)||__codexWindowHit}`;
}

function avatarInputShapePatch({ includeMascotInputRegion = true } = {}) {
  const prefix = includeMascotInputRegion ? mascotInputRegionMethod : "";
  return `${prefix}codexLinuxBuildAvatarInputShape(e){let t=this.layout;if(t==null)return null;let r;try{r=e.getContentBounds()}catch{return null}if(r==null||!Number.isFinite(r.width)||!Number.isFinite(r.height))return null;if(this.dragState!=null||this.pointerInteractive)return[{x:0,y:0,width:r.width,height:r.height}];let i=e=>{if(e==null)return null;let t=Math.max(0,e.left),n=Math.max(0,e.top),i=Math.min(r.width,e.left+e.width)-t,a=Math.min(r.height,e.top+e.height)-n;return i<=0||a<=0?null:{x:t,y:n,width:i,height:a}};return[i(this.codexLinuxMascotInputRegion(t)),this.traySize!=null?i(t.tray):null].filter(Boolean)}`;
}

function avatarApplyInputShapePatch() {
  return "codexLinuxApplyAvatarInputShape(e){if(process.platform!==`linux`||e==null||e.isDestroyed()||typeof e.setShape!=`function`)return!1;try{let t=this.codexLinuxBuildAvatarInputShape(e);if(t==null)return!1;let n=JSON.stringify(t);if(this.codexLinuxAvatarInputShapeKey===n)return!0;e.setShape(t),this.codexLinuxAvatarInputShapeKey=n;return!0}catch{this.codexLinuxAvatarInputShapeKey=null;return!1}}";
}

function patchAvatarOverlayWindowOptions(source) {
  const windowOptionsPatch =
    "appearance:`avatarOverlay`,alwaysOnTop:process.platform===`linux`,skipTaskbar:process.platform===`linux`,focusable:process.platform===`linux`?!0:!1";
  if (source.includes(windowOptionsPatch)) {
    return source;
  }
  return source
    .replace(
      "appearance:`avatarOverlay`,focusable:process.platform===`linux`?!0:!1",
      windowOptionsPatch,
    )
    .replace(
      "appearance:`avatarOverlay`,focusable:!1",
      windowOptionsPatch,
    );
}

function upgradeAvatarOverlayInjectedMethods(source, electronVar) {
  let patched = source;
  patched = replaceAvatarMethod(
    patched,
    /codexLinuxBuildAvatarInputShape\(e\)\{/,
    avatarInputShapePatch({
      includeMascotInputRegion: !patched.includes("codexLinuxMascotInputRegion"),
    }),
  );
  patched = replaceAvatarMethod(
    patched,
    /codexLinuxApplyAvatarInputShape\(e\)\{/,
    avatarApplyInputShapePatch(),
  );
  patched = replaceAvatarMethod(
    patched,
    /codexLinuxIsCursorInAvatarInteractiveRegion\(e\)\{/,
    avatarCursorRegionPatch(electronVar),
  );
  return patched;
}

function applyLinuxAvatarOverlayMousePassthroughPatch(currentSource) {
  let patchedSource = currentSource;
  const electronVar = requireName(currentSource, "electron") ?? "n";
  const childProcessVar = requireName(currentSource, "node:child_process");
  const withElectronAlias = (source) =>
    electronVar === "n" ? source : source.replaceAll("n.screen", `${electronVar}.screen`);
  const i3SessionMethod =
    "codexLinuxIsI3Session(){let e=[process.env.XDG_CURRENT_DESKTOP,process.env.DESKTOP_SESSION,process.env.I3SOCK].filter(Boolean).join(`:`).toLowerCase();return/(^|[:;/])i3([:;/.-]|$)/.test(e)}";
  const compositorHintsMethod =
    childProcessVar == null
      ? "codexLinuxApplyAvatarCompositorHints(e){}"
      : `codexLinuxApplyAvatarCompositorHints(e){if(process.platform!==\`linux\`||!this.codexLinuxIsI3Session()||this.codexLinuxAvatarCompositorHintsApplied||this.codexLinuxAvatarCompositorHintsApplying||e==null||e.isDestroyed()||!process.env.DISPLAY)return;let t;try{t=e.getBounds?.()??e.getContentBounds?.()}catch{}if(t==null||!Number.isFinite(t.x)||!Number.isFinite(t.y)||!Number.isFinite(t.width)||!Number.isFinite(t.height))return;let n=[];try{let r=e.getNativeWindowHandle?.();r!=null&&r.length>=4&&n.push(String(r.readUInt32LE(0)))}catch{}this.codexLinuxAvatarCompositorHintsApplying=!0;let r=e=>{let r=[...new Set(e)].filter(e=>/^[0-9]+$/.test(e)&&e!==\`0\`);if(r.length===0){this.codexLinuxAvatarCompositorHintsApplying=!1;return}let i=r.length,a=!1,o=()=>{i--,i===0&&(this.codexLinuxAvatarCompositorHintsApplying=!1,a&&(this.codexLinuxAvatarCompositorHintsApplied=!0))},s=e=>{try{${childProcessVar}.execFile(\`xwininfo\`,[\`-id\`,e],{timeout:1e3},(r,i)=>{if(r){o();return}let s=String(i??\`\`),c=s.match(/Absolute upper-left X:\\s+(-?\\d+)[\\s\\S]*Absolute upper-left Y:\\s+(-?\\d+)[\\s\\S]*Width:\\s+(\\d+)[\\s\\S]*Height:\\s+(\\d+)/);if(c==null||!/Override Redirect State:\\s+yes/.test(s)){o();return}let[,l,h,d,f]=c;if(Number(l)!==t.x||Number(h)!==t.y||Number(d)!==t.width||Number(f)!==t.height){o();return}try{${childProcessVar}.execFile(\`xprop\`,[\`-id\`,e,\`-f\`,\`_GTK_FRAME_EXTENTS\`,\`32c\`,\`-set\`,\`_GTK_FRAME_EXTENTS\`,\`0, 0, 0, 0\`],{timeout:1e3},e=>{e||(a=!0),o()})}catch{o()}})}catch{o()}};for(let t of r)s(t)};try{${childProcessVar}.execFile(\`xdotool\`,[\`search\`,\`--pid\`,String(process.pid)],{timeout:1e3},(e,t)=>{r([...n,...String(t??\`\`).trim().split(/\\s+/).filter(Boolean)])})}catch{r(n)}}`;
  const waylandSessionMethod =
    "codexLinuxAvatarUsesNativeWayland(){let e=process.argv.join(` `);if(/--ozone-platform=wayland(\\s|$)/.test(e))return!0;if(/--ozone-platform=x11(\\s|$)/.test(e))return!1;let t=[process.env.XDG_SESSION_TYPE,process.env.WAYLAND_DISPLAY].filter(Boolean).join(`:`).toLowerCase();return t.includes(`wayland`)&&!process.env.DISPLAY}";
  const waylandInteractivePolicy =
    "if(process.platform===`linux`&&this.codexLinuxAvatarUsesNativeWayland()){this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.pointerInteractive=!0,this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1),e.setIgnoreMouseEvents(!1);return}";
  const previousLinuxInteractivePolicy =
    "if(process.platform===`linux`){this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.pointerInteractive=!0,this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1),e.setIgnoreMouseEvents(!1);return}";
  const previousWaylandInteractivePolicy =
    "if(process.platform===`linux`&&this.codexLinuxAvatarUsesWayland()){this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.pointerInteractive=!0,this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1),e.setIgnoreMouseEvents(!1);return}";

  const interactivityNeedle =
    "applyPointerInteractivityPolicy(){let e=this.window;if(e==null||e.isDestroyed()){this.mousePassthroughEnabled=!1;return}let t=!this.pointerInteractive;if(this.mousePassthroughEnabled!==t){if(this.mousePassthroughEnabled=t,t){e.setIgnoreMouseEvents(!0,{forward:!0});return}e.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(e)}}refreshCursorAtCurrentMousePosition(e){";
  const previousInteractivityNeedle =
    "applyPointerInteractivityPolicy(){let e=this.window;if(e==null||e.isDestroyed()){this.mousePassthroughEnabled=!1,this.codexLinuxStopAvatarPassthroughRecovery();return}let t=!this.pointerInteractive;if(this.mousePassthroughEnabled!==t){if(this.mousePassthroughEnabled=t,t){e.setIgnoreMouseEvents(!0,{forward:!0}),this.codexLinuxStartAvatarPassthroughRecovery();return}this.codexLinuxStopAvatarPassthroughRecovery(),e.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(e)}else t&&this.codexLinuxStartAvatarPassthroughRecovery()}codexLinuxStopAvatarPassthroughRecovery(){this.codexLinuxAvatarPassthroughRecoveryTimer!=null&&(clearInterval(this.codexLinuxAvatarPassthroughRecoveryTimer),this.codexLinuxAvatarPassthroughRecoveryTimer=null)}codexLinuxRecoverAvatarPointerInteractivity(){this.pointerInteractive=!0,this.applyPointerInteractivityPolicy()}codexLinuxStartAvatarPassthroughRecovery(){if(process.platform!==`linux`||this.codexLinuxAvatarPassthroughRecoveryTimer!=null)return;this.codexLinuxAvatarPassthroughRecoveryTimer=setInterval(()=>{let e=this.window;if(e==null||e.isDestroyed()||!this.mousePassthroughEnabled){this.codexLinuxStopAvatarPassthroughRecovery();return}let t;try{t=this.codexLinuxIsCursorInAvatarInteractiveRegion(e)}catch{this.codexLinuxRecoverAvatarPointerInteractivity();return}t&&this.codexLinuxRecoverAvatarPointerInteractivity()},80),this.codexLinuxAvatarPassthroughRecoveryTimer.unref?.()}codexLinuxIsCursorInAvatarInteractiveRegion(e){let t=this.layout;if(t==null)return!1;let r=n.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=r.x-i.x,o=r.y-i.y,s=e=>e!=null&&a>=e.left&&a<=e.left+e.width&&o>=e.top&&o<=e.top+e.height;return s(t.mascot)||s(t.tray)}refreshCursorAtCurrentMousePosition(e){";
  const previousSyncInteractivityNeedle =
    "applyPointerInteractivityPolicy(){let e=this.window;if(e==null||e.isDestroyed()){this.mousePassthroughEnabled=!1,this.codexLinuxStopAvatarPassthroughRecovery();return}process.platform===`linux`&&(this.codexLinuxStartAvatarPassthroughRecovery(),this.codexLinuxSyncAvatarPointerInteractivity(e));let t=!this.pointerInteractive;this.dragState!=null&&(t=!1);if(this.mousePassthroughEnabled!==t){if(this.mousePassthroughEnabled=t,t){e.setIgnoreMouseEvents(!0,{forward:!0});return}e.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(e)}}codexLinuxStopAvatarPassthroughRecovery(){this.codexLinuxAvatarPassthroughRecoveryTimer!=null&&(clearInterval(this.codexLinuxAvatarPassthroughRecoveryTimer),this.codexLinuxAvatarPassthroughRecoveryTimer=null)}codexLinuxStartAvatarPassthroughRecovery(){if(process.platform!==`linux`||this.codexLinuxAvatarPassthroughRecoveryTimer!=null)return;this.codexLinuxAvatarPassthroughRecoveryTimer=setInterval(()=>{let e=this.window;if(e==null||e.isDestroyed()||!e.isVisible()){this.codexLinuxStopAvatarPassthroughRecovery();return}this.codexLinuxSyncAvatarPointerInteractivity(e)&&this.applyPointerInteractivityPolicy()},32),this.codexLinuxAvatarPassthroughRecoveryTimer.unref?.()}codexLinuxSyncAvatarPointerInteractivity(e){if(process.platform!==`linux`||e==null||e.isDestroyed())return!1;if(this.dragState!=null){if(this.pointerInteractive)return!1;return this.pointerInteractive=!0,!0}let t;try{t=this.codexLinuxIsCursorInAvatarInteractiveRegion(e)}catch{t=!0}return this.pointerInteractive===t?!1:(this.pointerInteractive=t,!0)}codexLinuxIsCursorInAvatarInteractiveRegion(e){let t=this.layout;if(t==null)return!1;let r=n.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=r.x-i.x,o=r.y-i.y;if(a<0||o<0||a>i.width||o>i.height)return!1;let s=e=>e!=null&&a>=e.left&&a<=e.left+e.width&&o>=e.top&&o<=e.top+e.height;return s(t.mascot)||s(t.tray)}refreshCursorAtCurrentMousePosition(e){";
  const previousFullWindowDragShapeNeedle =
    "codexLinuxBuildAvatarInputShape(e){let t=this.layout;if(t==null)return null;if(this.dragState!=null){let t=e.getContentBounds();return[{x:0,y:0,width:t.width,height:t.height}]}let r=e.getContentBounds(),i=e=>{if(e==null)return null;let t=Math.max(0,e.left),n=Math.max(0,e.top),i=Math.min(r.width,e.left+e.width)-t,a=Math.min(r.height,e.top+e.height)-n;return i<=0||a<=0?null:{x:t,y:n,width:i,height:a}};return[i(t.mascot),i(t.tray)].filter(Boolean)}";
  const previousMascotRectShapeNeedle =
    "codexLinuxBuildAvatarInputShape(e){let t=this.layout;if(t==null)return null;let r=e.getContentBounds(),i=e=>{if(e==null)return null;let t=Math.max(0,e.left),n=Math.max(0,e.top),i=Math.min(r.width,e.left+e.width)-t,a=Math.min(r.height,e.top+e.height)-n;return i<=0||a<=0?null:{x:t,y:n,width:i,height:a}},a=[i(t.mascot)];this.traySize!=null&&a.push(i(t.tray));return a.filter(Boolean)}";
  const avatarInputShapePatch =
    `${mascotInputRegionMethod}codexLinuxBuildAvatarInputShape(e){let t=this.layout;if(t==null)return null;let r;try{r=e.getContentBounds()}catch{return null}if(r==null||!Number.isFinite(r.width)||!Number.isFinite(r.height))return null;if(this.dragState!=null||this.pointerInteractive)return[{x:0,y:0,width:r.width,height:r.height}];let i=e=>{if(e==null)return null;let t=Math.max(0,e.left),n=Math.max(0,e.top),i=Math.min(r.width,e.left+e.width)-t,a=Math.min(r.height,e.top+e.height)-n;return i<=0||a<=0?null:{x:t,y:n,width:i,height:a}};return[i(this.codexLinuxMascotInputRegion(t)),this.traySize!=null?i(t.tray):null].filter(Boolean)}`;
  const previousHiddenTrayHitTestNeedle =
    "return s(t.mascot)||s(t.tray)}refreshCursorAtCurrentMousePosition(e){";
  const hiddenTrayHitTestPatch =
    "return s(this.codexLinuxMascotInputRegion(t))||this.traySize!=null&&s(t.tray)}refreshCursorAtCurrentMousePosition(e){";
  const previousShapeInteractivityNeedle =
    "applyPointerInteractivityPolicy(){let e=this.window;if(e==null||e.isDestroyed()){this.mousePassthroughEnabled=!1,this.codexLinuxStopAvatarPassthroughRecovery();return}if(process.platform===`linux`&&typeof e.setShape==`function`){this.codexLinuxStopAvatarPassthroughRecovery(),this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1,e.setIgnoreMouseEvents(!1));if(this.codexLinuxApplyAvatarInputShape(e))return}process.platform===`linux`&&(this.codexLinuxStartAvatarPassthroughRecovery(),this.codexLinuxSyncAvatarPointerInteractivity(e));let t=!this.pointerInteractive;this.dragState!=null&&(t=!1);if(this.mousePassthroughEnabled!==t){if(this.mousePassthroughEnabled=t,t){e.setIgnoreMouseEvents(!0,{forward:!0});return}e.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(e)}}codexLinuxStopAvatarPassthroughRecovery(){this.codexLinuxAvatarPassthroughRecoveryTimer!=null&&(clearInterval(this.codexLinuxAvatarPassthroughRecoveryTimer),this.codexLinuxAvatarPassthroughRecoveryTimer=null)}codexLinuxBuildAvatarInputShape(e){let t=this.layout;if(t==null)return null;if(this.dragState!=null){let t=e.getContentBounds();return[{x:0,y:0,width:t.width,height:t.height}]}let r=e.getContentBounds(),i=e=>{if(e==null)return null;let t=Math.max(0,e.left),n=Math.max(0,e.top),i=Math.min(r.width,e.left+e.width)-t,a=Math.min(r.height,e.top+e.height)-n;return i<=0||a<=0?null:{x:t,y:n,width:i,height:a}};return[i(t.mascot),i(t.tray)].filter(Boolean)}codexLinuxApplyAvatarInputShape(e){if(process.platform!==`linux`||e==null||e.isDestroyed()||typeof e.setShape!=`function`)return!1;let t=this.codexLinuxBuildAvatarInputShape(e);if(t==null)return!1;let n=JSON.stringify(t);if(this.codexLinuxAvatarInputShapeKey===n)return!0;try{e.setShape(t),this.codexLinuxAvatarInputShapeKey=n;return!0}catch{this.codexLinuxAvatarInputShapeKey=null;return!1}}codexLinuxStartAvatarPassthroughRecovery(){if(process.platform!==`linux`||this.codexLinuxAvatarPassthroughRecoveryTimer!=null)return;this.codexLinuxAvatarPassthroughRecoveryTimer=setInterval(()=>{let e=this.window;if(e==null||e.isDestroyed()||!e.isVisible()){this.codexLinuxStopAvatarPassthroughRecovery();return}this.codexLinuxSyncAvatarPointerInteractivity(e)&&this.applyPointerInteractivityPolicy()},32),this.codexLinuxAvatarPassthroughRecoveryTimer.unref?.()}codexLinuxSyncAvatarPointerInteractivity(e){if(process.platform!==`linux`||e==null||e.isDestroyed())return!1;if(this.dragState!=null){if(this.pointerInteractive)return!1;return this.pointerInteractive=!0,!0}let t;try{t=this.codexLinuxIsCursorInAvatarInteractiveRegion(e)}catch{t=!0}return this.pointerInteractive===t?!1:(this.pointerInteractive=t,!0)}codexLinuxIsCursorInAvatarInteractiveRegion(e){let t=this.layout;if(t==null)return!1;let r=n.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=r.x-i.x,o=r.y-i.y;if(a<0||o<0||a>i.width||o>i.height)return!1;let s=e=>e!=null&&a>=e.left&&a<=e.left+e.width&&o>=e.top&&o<=e.top+e.height;return s(t.mascot)||s(t.tray)}refreshCursorAtCurrentMousePosition(e){";
  const currentShapeInteractivityPatch = previousShapeInteractivityNeedle.replace(
    previousFullWindowDragShapeNeedle,
    avatarInputShapePatch,
  )
    .replace(previousHiddenTrayHitTestNeedle, hiddenTrayHitTestPatch)
    .replace(
      "let r=n.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=r.x-i.x,o=r.y-i.y;",
      "let codexLinuxCursorPoint=n.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=codexLinuxCursorPoint.x-i.x,o=codexLinuxCursorPoint.y-i.y;",
    );
  const interactivityPatch = withElectronAlias(currentShapeInteractivityPatch)
    .replace(
      "if(process.platform===`linux`&&typeof e.setShape==`function`){",
      `${waylandInteractivePolicy}if(process.platform===\`linux\`&&typeof e.setShape==\`function\`){`,
    )
    .replace(
      "codexLinuxStopAvatarPassthroughRecovery(){",
      `${waylandSessionMethod}${i3SessionMethod}${compositorHintsMethod}codexLinuxStopAvatarPassthroughRecovery(){`,
    );
  const previousI3AlwaysInteractivePatch =
    "if(process.platform===`linux`&&this.codexLinuxIsI3Session()){this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.pointerInteractive=!0,this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1),e.setIgnoreMouseEvents(!1);return}";
  const previousI3SetShapeGuardPatch =
    "if(process.platform===`linux`&&typeof e.setShape==`function`&&!this.codexLinuxIsI3Session()){";
  const previousSetShapePolicyPatch =
    "if(process.platform===`linux`&&typeof e.setShape==`function`){this.codexLinuxStopAvatarPassthroughRecovery(),this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1,e.setIgnoreMouseEvents(!1));if(this.codexLinuxApplyAvatarInputShape(e))return}";
  const setShapePolicyPatch =
    "if(process.platform===`linux`&&typeof e.setShape==`function`){this.codexLinuxStartAvatarPassthroughRecovery(),this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1,e.setIgnoreMouseEvents(!1));if(this.codexLinuxApplyAvatarInputShape(e))return}";

  if (!patchedSource.includes("codexLinuxIsI3Session")) {
    if (patchedSource.includes(interactivityNeedle)) {
      recordStrategy("avatar-interactivity", "upstream");
      patchedSource = patchedSource.replace(interactivityNeedle, interactivityPatch);
    } else if (patchedSource.includes(previousInteractivityNeedle)) {
      recordStrategy("avatar-interactivity", "legacy:passthrough-recovery");
      patchedSource = patchedSource.replace(previousInteractivityNeedle, interactivityPatch);
    } else if (patchedSource.includes(previousSyncInteractivityNeedle)) {
      recordStrategy("avatar-interactivity", "legacy:sync-passthrough");
      patchedSource = patchedSource.replace(previousSyncInteractivityNeedle, interactivityPatch);
    } else if (patchedSource.includes(previousShapeInteractivityNeedle)) {
      recordStrategy("avatar-interactivity", "legacy:shape-passthrough");
      patchedSource = patchedSource.replace(previousShapeInteractivityNeedle, interactivityPatch);
    } else if (
      patchedSource.includes("avatar-overlay") &&
      patchedSource.includes("applyPointerInteractivityPolicy(){let e=this.window")
    ) {
      recordStrategy("avatar-interactivity", "none");
      console.warn(
        "WARN: Could not find avatar overlay mouse passthrough policy — skipping Linux avatar overlay passthrough recovery patch",
      );
      return currentSource;
    }
  } else {
    recordStrategy("avatar-interactivity", "already-applied");
  }
  if (
    patchedSource.includes("codexLinuxIsI3Session") &&
    !patchedSource.includes("codexLinuxApplyAvatarCompositorHints")
  ) {
    patchedSource = patchedSource.replace(
      `${i3SessionMethod}codexLinuxStopAvatarPassthroughRecovery(){`,
      `${i3SessionMethod}${compositorHintsMethod}codexLinuxStopAvatarPassthroughRecovery(){`,
    );
  }
  if (
    patchedSource.includes("codexLinuxIsI3Session") &&
    !patchedSource.includes("codexLinuxAvatarUsesNativeWayland")
  ) {
    patchedSource = patchedSource.replace(i3SessionMethod, `${waylandSessionMethod}${i3SessionMethod}`);
  }
  if (patchedSource.includes(previousLinuxInteractivePolicy)) {
    patchedSource = patchedSource.replace(previousLinuxInteractivePolicy, waylandInteractivePolicy);
  }
  if (patchedSource.includes(previousWaylandInteractivePolicy)) {
    patchedSource = patchedSource.replace(previousWaylandInteractivePolicy, waylandInteractivePolicy);
  }
  if (!patchedSource.includes(waylandInteractivePolicy)) {
    patchedSource = patchedSource.replace(
      "if(process.platform===`linux`&&typeof e.setShape==`function`){",
      `${waylandInteractivePolicy}if(process.platform===\`linux\`&&typeof e.setShape==\`function\`){`,
    );
  }
  if (patchedSource.includes(previousFullWindowDragShapeNeedle)) {
    patchedSource = patchedSource.replace(previousFullWindowDragShapeNeedle, avatarInputShapePatch);
  }
  if (
    !patchedSource.includes("codexLinuxMascotInputRegion") &&
    patchedSource.includes(previousMascotRectShapeNeedle)
  ) {
    patchedSource = patchedSource.replace(previousMascotRectShapeNeedle, avatarInputShapePatch);
  }
  if (patchedSource.includes(previousHiddenTrayHitTestNeedle)) {
    patchedSource = patchedSource.replace(previousHiddenTrayHitTestNeedle, hiddenTrayHitTestPatch);
  }
  if (patchedSource.includes(previousI3AlwaysInteractivePatch)) {
    patchedSource = patchedSource.replace(previousI3AlwaysInteractivePatch, "");
  }
  if (patchedSource.includes(previousI3SetShapeGuardPatch)) {
    patchedSource = patchedSource.replace(
      previousI3SetShapeGuardPatch,
      "if(process.platform===`linux`&&typeof e.setShape==`function`){",
    );
  }
  if (patchedSource.includes("codexLinuxIsCursorInAvatarInteractiveRegion")) {
    patchedSource = patchedSource.replace(
      /let r=([A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),i=e\.getContentBounds\(\),a=r\.x-i\.x,o=r\.y-i\.y;/g,
      (_match, screenVar) => {
        const screenAlias = screenVar === "n" ? electronVar : screenVar;
        return `let codexLinuxCursorPoint=${screenAlias}.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=codexLinuxCursorPoint.x-i.x,o=codexLinuxCursorPoint.y-i.y;`;
      },
    );
  }

  const startDragAnchorRegex =
    /(let ([A-Za-z_$][\w$]*)=this\.getLayout\([A-Za-z_$][\w$]*\);)this\.dragState=\{pointerAnchorX:([A-Za-z_$][\w$]*)-\2\.mascot\.left,pointerAnchorY:([A-Za-z_$][\w$]*)-\2\.mascot\.top,/;
  if (startDragAnchorRegex.test(patchedSource)) {
    patchedSource = patchedSource.replace(
      startDragAnchorRegex,
      "$1let codexLinuxMascotDragRegion=process.platform===`linux`&&typeof this.codexLinuxMascotInputRegion==`function`?this.codexLinuxMascotInputRegion($2):$2.mascot;this.dragState={pointerAnchorX:$3-codexLinuxMascotDragRegion.left,pointerAnchorY:$4-codexLinuxMascotDragRegion.top,",
    );
  }
  patchedSource = patchedSource.replaceAll(previousSetShapePolicyPatch, setShapePolicyPatch);
  patchedSource = upgradeAvatarOverlayInjectedMethods(patchedSource, electronVar);
  const beforeFocusablePatch = patchedSource;
  patchedSource = patchAvatarOverlayWindowOptions(patchedSource);
  recordStrategy(
    "avatar-window-options",
    patchedSource === beforeFocusablePatch
      ? patchedSource.includes("appearance:`avatarOverlay`") ? "already-applied" : "none"
      : "upstream",
  );

  const previousStartDragPatch =
    "startDrag(e,{pointerWindowX:t,pointerWindowY:r}){let i=this.window;if(i==null||i.isDestroyed()||i.webContents.id!==e)return;this.pointerInteractive=!0,this.applyPointerInteractivityPolicy(),this.cancelMomentum();";
  const originalStartDragPrefix =
    "startDrag(e,{pointerWindowX:t,pointerWindowY:r}){let i=this.window;if(i==null||i.isDestroyed()||i.webContents.id!==e)return;this.cancelMomentum();";
  const startDragNeedle =
    "displayBounds:n.screen.getDisplayNearestPoint(n.screen.getCursorScreenPoint()).bounds}}moveDrag(e){";
  const startDragPatch =
    `displayBounds:${electronVar}.screen.getDisplayNearestPoint(${electronVar}.screen.getCursorScreenPoint()).bounds},process.platform===\`linux\`&&(this.pointerInteractive=!0,this.applyPointerInteractivityPolicy())}moveDrag(e){`;
  const previousStartDragAfterStatePatch =
    "displayBounds:n.screen.getDisplayNearestPoint(n.screen.getCursorScreenPoint()).bounds},this.pointerInteractive=!0,this.applyPointerInteractivityPolicy()}moveDrag(e){";
  const startDragRegex =
    /displayBounds:([A-Za-z_$][\w$]*)\.screen\.getDisplayNearestPoint\(\1\.screen\.getCursorScreenPoint\(\)\)\.bounds\}\}moveDrag\(e\)\{/;
  const previousStartDragAfterStateRegex =
    /displayBounds:([A-Za-z_$][\w$]*)\.screen\.getDisplayNearestPoint\(\1\.screen\.getCursorScreenPoint\(\)\)\.bounds\},this\.pointerInteractive=!0,this\.applyPointerInteractivityPolicy\(\)\}moveDrag\(e\)\{/;
  const currentStartDragPatchRegex =
    /displayBounds:([A-Za-z_$][\w$]*)\.screen\.getDisplayNearestPoint\(\1\.screen\.getCursorScreenPoint\(\)\)\.bounds\},process\.platform===`linux`&&\(this\.pointerInteractive=!0,this\.applyPointerInteractivityPolicy\(\)\)\}moveDrag\([A-Za-z_$][\w$]*(?:,codexLinuxDragPoint)?\)\{/;
  if (patchedSource.includes(previousStartDragPatch)) {
    patchedSource = patchedSource.replace(previousStartDragPatch, originalStartDragPrefix);
  }
  if (currentStartDragPatchRegex.test(patchedSource)) {
    recordStrategy("avatar-start-drag", "already-applied");
  } else if (previousStartDragAfterStateRegex.test(patchedSource)) {
    recordStrategy("avatar-start-drag", "legacy:after-state-regex");
    patchedSource = patchedSource.replace(previousStartDragAfterStateRegex, startDragPatch);
  } else if (patchedSource.includes(previousStartDragAfterStatePatch)) {
    recordStrategy("avatar-start-drag", "legacy:after-state");
    patchedSource = patchedSource.replace(previousStartDragAfterStatePatch, startDragPatch);
  } else if (patchedSource.includes(startDragNeedle)) {
    recordStrategy("avatar-start-drag", "upstream");
    patchedSource = patchedSource.replace(startDragNeedle, startDragPatch);
  } else if (startDragRegex.test(patchedSource)) {
    recordStrategy("avatar-start-drag", "upstream-regex");
    patchedSource = patchedSource.replace(startDragRegex, startDragPatch);
  } else if (
    patchedSource.includes("avatar-overlay") &&
    !patchedSource.includes(startDragPatch)
  ) {
    recordStrategy("avatar-start-drag", "none");
    console.warn(
      "WARN: Could not find avatar overlay drag start — skipping Linux avatar overlay drag interactivity patch",
    );
  }

  const endDragNeedle =
    "endDrag(e){let t=this.window;t==null||t.isDestroyed()||t.webContents.id!==e||(this.dragState?.hasMoved&&this.moveDragToCurrentCursor(t),this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0}))}";
  const endDragPatch =
    "endDrag(e){let t=this.window;t==null||t.isDestroyed()||t.webContents.id!==e||(this.dragState?.hasMoved&&this.moveDragToCurrentCursor(t),this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0}),process.platform===`linux`&&this.applyPointerInteractivityPolicy())}";
  const previousEndDragPatch =
    "endDrag(e){let t=this.window;t==null||t.isDestroyed()||t.webContents.id!==e||(this.dragState?.hasMoved&&this.moveDragToCurrentCursor(t),this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0}),this.codexLinuxSyncAvatarPointerInteractivity(t)&&this.applyPointerInteractivityPolicy())}";
  const currentEndDragPatchRegex =
    /endDrag\([^)]*\)\{[\s\S]*?this\.dragState\?\.hasMoved&&(?:process\.platform!==`linux`&&)?this\.moveDragToCurrentCursor\([^)]+\),this\.dragState=null,this\.reclampWindowToVisibleDisplay\(\{shouldPersist:!0\}\),process\.platform===`linux`&&this\.applyPointerInteractivityPolicy\(\)\)\}/;
  if (currentEndDragPatchRegex.test(patchedSource)) {
    recordStrategy("avatar-end-drag", "already-applied");
  } else if (patchedSource.includes(previousEndDragPatch)) {
    recordStrategy("avatar-end-drag", "legacy:sync-passthrough");
    patchedSource = patchedSource.replace(previousEndDragPatch, endDragPatch);
  } else if (patchedSource.includes(endDragNeedle)) {
    recordStrategy("avatar-end-drag", "upstream");
    patchedSource = patchedSource.replace(endDragNeedle, endDragPatch);
  } else if (patchedSource.includes(endDragPatch)) {
    recordStrategy("avatar-end-drag", "already-applied");
  } else if (
    patchedSource.includes("avatar-overlay")
  ) {
    recordStrategy("avatar-end-drag", "none");
    console.warn(
      "WARN: Could not find avatar overlay drag end — skipping Linux avatar overlay drag cleanup patch",
    );
  }
  const moveDragMethod = findAvatarMethod(
    patchedSource,
    /moveDrag\([A-Za-z_$][\w$]*\)\{/,
  );
  if (moveDragMethod != null && !moveDragMethod.text.includes("codexLinuxDragPoint")) {
    let patchedMethod = moveDragMethod.text.replace(
      /moveDrag\(([A-Za-z_$][\w$]*)\)\{/,
      "moveDrag($1,codexLinuxDragPoint){",
    );
    patchedMethod = patchedMethod.replace(
      /this\.moveDragToCurrentCursor\(([A-Za-z_$][\w$]*)\)/g,
      "this.moveDragToCurrentCursor($1,codexLinuxDragPoint)",
    );
    if (patchedMethod !== moveDragMethod.text) {
      patchedSource =
        patchedSource.slice(0, moveDragMethod.start) +
        patchedMethod +
        patchedSource.slice(moveDragMethod.end);
    }
  }
  const moveDragToCurrentCursorMethod = findAvatarMethod(
    patchedSource,
    /moveDragToCurrentCursor\([A-Za-z_$][\w$]*\)\{/,
  );
  if (
    moveDragToCurrentCursorMethod != null &&
    !moveDragToCurrentCursorMethod.text.includes("codexLinuxDragPoint")
  ) {
    let patchedMethod = moveDragToCurrentCursorMethod.text.replace(
      /moveDragToCurrentCursor\(([A-Za-z_$][\w$]*)\)\{/,
      "moveDragToCurrentCursor($1,codexLinuxDragPoint){",
    );
    patchedMethod = patchedMethod.replace(
      /let ([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.screen\.getCursorScreenPoint\(\),/,
      "let $1=codexLinuxDragPoint!=null&&Number.isFinite(codexLinuxDragPoint.screenX)&&Number.isFinite(codexLinuxDragPoint.screenY)?{x:codexLinuxDragPoint.screenX,y:codexLinuxDragPoint.screenY}:$2.screen.getCursorScreenPoint(),",
    );
    if (patchedMethod !== moveDragToCurrentCursorMethod.text) {
      patchedSource =
        patchedSource.slice(0, moveDragToCurrentCursorMethod.start) +
        patchedMethod +
        patchedSource.slice(moveDragToCurrentCursorMethod.end);
    }
  }
  const endDragMethod = findAvatarMethod(
    patchedSource,
    /endDrag\([A-Za-z_$][\w$]*\)\{/,
  );
  if (
    endDragMethod != null &&
    !endDragMethod.text.includes("process.platform!==`linux`&&this.moveDragToCurrentCursor")
  ) {
    const patchedMethod = endDragMethod.text.replace(
      /this\.dragState\?\.hasMoved&&this\.moveDragToCurrentCursor\(([A-Za-z_$][\w$]*)\)/g,
      "this.dragState?.hasMoved&&process.platform!==`linux`&&this.moveDragToCurrentCursor($1)",
    );
    if (patchedMethod !== endDragMethod.text) {
      patchedSource =
        patchedSource.slice(0, endDragMethod.start) +
        patchedMethod +
        patchedSource.slice(endDragMethod.end);
    }
  }
  const dragMoveDispatcherNeedle =
    "case`avatar-overlay-drag-move`:this.avatarOverlayManager.moveDrag(e.id);break;";
  const dragMoveDispatcherPatch =
    "case`avatar-overlay-drag-move`:this.avatarOverlayManager.moveDrag(e.id,{screenX:i.screenX,screenY:i.screenY});break;";
  if (patchedSource.includes(dragMoveDispatcherNeedle)) {
    patchedSource = patchedSource.replace(dragMoveDispatcherNeedle, dragMoveDispatcherPatch);
  }

  const elementSizeDispatcherNeedle =
    "case`avatar-overlay-element-size-changed`:this.avatarOverlayManager.setElementSize(e.id,{isTrayVisible:i.isTrayVisible,mascot:i.mascot,tray:i.tray});break;";
  const elementSizeDispatcherPatch =
    "case`avatar-overlay-element-size-changed`:this.avatarOverlayManager.setElementSize(e.id,{isTrayVisible:i.isTrayVisible,mascot:i.mascot,mascotShape:i.mascotShape,tray:i.tray});break;";
  if (patchedSource.includes(elementSizeDispatcherNeedle)) {
    patchedSource = patchedSource.replace(elementSizeDispatcherNeedle, elementSizeDispatcherPatch);
  }

  const setElementSizeMethod = findAvatarMethod(
    patchedSource,
    /setElementSize\([A-Za-z_$][\w$]*,\{(?:[^{}]*,)?mascot:[A-Za-z_$][\w$]*(?:,mascotShape:[A-Za-z_$][\w$]*)?,tray:[A-Za-z_$][\w$]*(?:,[^{}]*)?\}\)\{/,
  );
  if (setElementSizeMethod != null) {
    let elementSizeStrategy = "already-applied";
    const signatureMatch = setElementSizeMethod.text.match(
      /setElementSize\(([A-Za-z_$][\w$]*),\{(?:isTrayVisible:([A-Za-z_$][\w$]*),)?mascot:([A-Za-z_$][\w$]*)(?:,mascotShape:([A-Za-z_$][\w$]*))?,tray:([A-Za-z_$][\w$]*)\}\)\{/,
    );
    let patchedMethod = setElementSizeMethod.text;
    if (signatureMatch != null) {
      const [, webContentsIdVar, existingTrayVisibleVar, mascotVar, existingMascotShapeVar, trayVar] = signatureMatch;
      const trayVisibleVar = existingTrayVisibleVar ?? "codexLinuxIsTrayVisible";
      const mascotShapeVar = existingMascotShapeVar ?? "codexLinuxMascotShape";
      if (existingTrayVisibleVar == null || existingMascotShapeVar == null) {
        elementSizeStrategy = "upstream";
        patchedMethod = patchedMethod.replace(
          signatureMatch[0],
          `setElementSize(${webContentsIdVar},{isTrayVisible:${trayVisibleVar},mascot:${mascotVar},mascotShape:${mascotShapeVar},tray:${trayVar}}){`,
        );
      }
      const mascotShapePatch = `this.codexLinuxMascotShape=process.platform===\`linux\`?${mascotShapeVar}??null:null`;
      if (!patchedMethod.includes("this.codexLinuxMascotShape=process.platform===`linux`?")) {
        elementSizeStrategy = "upstream";
        patchedMethod = patchedMethod.replace(
          new RegExp(`this\\.mascotSize=${escapeRegExp(mascotVar)}(?=[^A-Za-z0-9_$]|$)`),
          `this.mascotSize=${mascotVar},${mascotShapePatch}`,
        );
      }
      const traySizePatch = `this.traySize=process.platform===\`linux\`&&${trayVisibleVar}===!1?null:${trayVar}`;
      if (!patchedMethod.includes(traySizePatch)) {
        elementSizeStrategy = "upstream";
        patchedMethod = patchedMethod.replace(
          new RegExp(`this\\.traySize=${escapeRegExp(trayVar)}(?=[^A-Za-z0-9_$]|$)`, "g"),
          traySizePatch,
        );
      }
    }
    if (
      !/this\.(?:applyLayout|applyLatestElementSizes)\([A-Za-z_$][\w$]*\),process\.platform===`linux`&&this\.applyPointerInteractivityPolicy\(\)/.test(patchedMethod)
    ) {
      elementSizeStrategy = "upstream";
      patchedMethod = patchedMethod.replace(
        /this\.(applyLayout|applyLatestElementSizes)\(([A-Za-z_$][\w$]*)\)(?!,process\.platform===`linux`&&this\.applyPointerInteractivityPolicy\(\))/g,
        "this.$1($2),process.platform===`linux`&&this.applyPointerInteractivityPolicy()",
      );
    }
    recordStrategy("avatar-element-size", elementSizeStrategy);
    if (patchedMethod !== setElementSizeMethod.text) {
      patchedSource =
        patchedSource.slice(0, setElementSizeMethod.start) +
        patchedMethod +
        patchedSource.slice(setElementSizeMethod.end);
    }
  } else if (
    patchedSource.includes("avatar-overlay") &&
    !/setElementSize\([^{}]+\)\{[^]*?this\.applyLayout\([A-Za-z_$][\w$]*\),process\.platform===`linux`&&this\.applyPointerInteractivityPolicy\(\)/.test(patchedSource)
  ) {
    recordStrategy("avatar-element-size", "none");
    console.warn(
      "WARN: Could not find avatar overlay element size update — skipping Linux avatar overlay layout interactivity patch",
    );
  }

  if (
    !patchedSource.includes("this.codexLinuxMascotShape=null,this.codexLinuxAvatarCompositorHintsApplied=!1")
  ) {
    if (
      patchedSource.includes(
        "this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,",
      )
    ) {
      patchedSource = patchedSource.replace(
        "this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,",
        "this.codexLinuxMascotShape=null,this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,",
      );
    } else {
      patchedSource = patchedSource.replace(
        /return this\.window=([A-Za-z_$][\w$]*),/,
        "return this.window=$1,this.codexLinuxMascotShape=null,this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,",
      );
    }
  }

  const i3TrayFallbackRegex =
    /traySize:this\.traySize\?\?([A-Za-z_$][\w$]*|\([^{};]*?\))\}\);this\.anchor=/;
  const i3TrayFallbackPatch =
    "traySize:process.platform===`linux`&&typeof this.codexLinuxIsI3Session==`function`&&this.codexLinuxIsI3Session()?this.traySize:this.traySize??$1});this.anchor=";
  if (
    !patchedSource.includes(
      "traySize:process.platform===`linux`&&typeof this.codexLinuxIsI3Session==`function`&&this.codexLinuxIsI3Session()",
    )
  ) {
    if (i3TrayFallbackRegex.test(patchedSource)) {
      recordStrategy("avatar-i3-tray-fallback", "upstream");
      patchedSource = patchedSource.replace(i3TrayFallbackRegex, i3TrayFallbackPatch);
    } else if (patchedSource.includes("avatar-overlay")) {
      recordStrategy("avatar-i3-tray-fallback", "none");
      console.warn(
        "WARN: Could not find avatar overlay default tray layout — skipping Linux i3 hidden tray layout patch",
      );
    }
  } else {
    recordStrategy("avatar-i3-tray-fallback", "already-applied");
  }

  const currentApplyLayoutPatchRegex =
    /this\.setWindowBounds\(e,([A-Za-z_$][\w$]*)\.windowBounds((?:,[A-Za-z_$][\w$]*)*)\),this\.sendLayoutToRenderer\(e\),process\.platform===`linux`&&this\.applyPointerInteractivityPolicy\(\)\}getLayout\(e\)\{/;
  const applyLayoutRegex =
    /this\.setWindowBounds\(e,([A-Za-z_$][\w$]*)\.windowBounds((?:,[A-Za-z_$][\w$]*)*)\),this\.sendLayoutToRenderer\(e\)\}getLayout\(e\)\{/;
  if (currentApplyLayoutPatchRegex.test(patchedSource)) {
    recordStrategy("avatar-apply-layout", "already-applied");
  } else if (applyLayoutRegex.test(patchedSource)) {
    recordStrategy("avatar-apply-layout", "upstream");
    patchedSource = patchedSource.replace(
      applyLayoutRegex,
      "this.setWindowBounds(e,$1.windowBounds$2),this.sendLayoutToRenderer(e),process.platform===`linux`&&this.applyPointerInteractivityPolicy()}getLayout(e){",
    );
  } else if (
    patchedSource.includes("avatar-overlay")
  ) {
    recordStrategy("avatar-apply-layout", "none");
    console.warn(
      "WARN: Could not find avatar overlay layout application — skipping Linux avatar overlay layout sync patch",
    );
  }

  const showWindowNeedle =
    "e.moveTop(),e.showInactive(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const showWindowPatch =
    "process.platform===`linux`&&e.setAlwaysOnTop(!0,`screen-saver`),e.moveTop(),process.platform===`linux`?e.show():e.showInactive(),process.platform===`linux`&&this.codexLinuxApplyAvatarCompositorHints(e),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const previousShowWindowScreenSaverPatch =
    "process.platform===`linux`&&e.setAlwaysOnTop(!0,`screen-saver`),e.moveTop(),e.showInactive(),process.platform===`linux`&&this.codexLinuxApplyAvatarCompositorHints(e),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const previousShowWindowLinuxPolicyPatch =
    "e.moveTop(),e.showInactive(),process.platform===`linux`&&this.codexLinuxApplyAvatarCompositorHints(e),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const previousShowWindowCompositorPatch =
    "e.moveTop(),process.platform===`linux`&&this.codexLinuxApplyAvatarCompositorHints(e),e.showInactive(),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const previousShowWindowI3Patch =
    "e.moveTop(),e.showInactive(),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const previousShowWindowPatch =
    "e.moveTop(),e.showInactive(),process.platform===`linux`&&this.codexLinuxStartAvatarPassthroughRecovery(),this.codexLinuxSyncAvatarPointerInteractivity(e)&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const currentShowWindowRegex =
    /e\.moveTop\(\),e\.showInactive\(\),(![A-Za-z_$][\w$]*&&this\.isOpen\(\)&&this\.broadcastOpenState\(\)\}showWindowIfReady\([A-Za-z_$][\w$]*\)\{)/;
  const currentShowWindowPatchRegex =
    /showWindow\([A-Za-z_$][\w$]*\)\{[^}]*process\.platform===`linux`&&this\.codexLinuxApplyAvatarCompositorHints\([A-Za-z_$][\w$]*\),process\.platform===`linux`&&this\.applyPointerInteractivityPolicy\(\),![A-Za-z_$][\w$]*&&this\.isOpen\(\)&&this\.broadcastOpenState\(\)\}showWindowIfReady\([A-Za-z_$][\w$]*\)\{/;
  if (patchedSource.includes(showWindowPatch)) {
    recordStrategy("avatar-show-window", "already-applied");
  } else if (patchedSource.includes(previousShowWindowScreenSaverPatch)) {
    recordStrategy("avatar-show-window", "legacy:screen-saver-show-inactive");
    patchedSource = patchedSource.replace(previousShowWindowScreenSaverPatch, showWindowPatch);
  } else if (patchedSource.includes(previousShowWindowLinuxPolicyPatch)) {
    recordStrategy("avatar-show-window", "legacy:linux-policy");
    patchedSource = patchedSource.replace(previousShowWindowLinuxPolicyPatch, showWindowPatch);
  } else if (patchedSource.includes(previousShowWindowCompositorPatch)) {
    recordStrategy("avatar-show-window", "legacy:compositor");
    patchedSource = patchedSource.replace(previousShowWindowCompositorPatch, showWindowPatch);
  } else if (patchedSource.includes(previousShowWindowPatch)) {
    recordStrategy("avatar-show-window", "legacy:sync-passthrough");
    patchedSource = patchedSource.replace(previousShowWindowPatch, showWindowPatch);
  } else if (patchedSource.includes(previousShowWindowI3Patch)) {
    recordStrategy("avatar-show-window", "legacy:i3");
    patchedSource = patchedSource.replace(previousShowWindowI3Patch, showWindowPatch);
  } else if (patchedSource.includes(showWindowNeedle)) {
    recordStrategy("avatar-show-window", "upstream");
    patchedSource = patchedSource.replace(showWindowNeedle, showWindowPatch);
  } else if (currentShowWindowPatchRegex.test(patchedSource)) {
    recordStrategy("avatar-show-window", "already-applied");
  } else if (currentShowWindowRegex.test(patchedSource)) {
    recordStrategy("avatar-show-window", "upstream-regex");
    patchedSource = patchedSource.replace(
      currentShowWindowRegex,
      "process.platform===`linux`&&e.setAlwaysOnTop(!0,`screen-saver`),e.moveTop(),process.platform===`linux`?e.show():e.showInactive(),process.platform===`linux`&&this.codexLinuxApplyAvatarCompositorHints(e),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),$1",
    );
  } else if (patchedSource.includes("avatar-overlay")) {
    recordStrategy("avatar-show-window", "none");
    console.warn(
      "WARN: Could not find avatar overlay show window — skipping Linux avatar overlay show sync patch",
    );
  }

  const createWindowMethod = findAvatarMethod(
    patchedSource,
    /async createWindow\([^)]*\)\{/,
  );
  if (createWindowMethod != null && createWindowMethod.text.includes("appearance:`avatarOverlay`")) {
    let patchedMethod = createWindowMethod.text;
    patchedMethod = patchedMethod.replace(
      /focusable:!1(?![A-Za-z0-9_$])/g,
      "focusable:process.platform===`linux`?!0:!1",
    );
    const windowVarMatch = patchedMethod.match(/let ([A-Za-z_$][\w$]*)=await this\.windowManager\.createWindow\(/);
    if (
      windowVarMatch != null &&
      !patchedMethod.includes(".setSkipTaskbar(!0)") &&
      !patchedMethod.includes("setAlwaysOnTop(!0,`screen-saver`)")
    ) {
      const windowVar = windowVarMatch[1];
      patchedMethod = patchedMethod.replace(
        `${windowVar}.setAlwaysOnTop(!0,\`floating\`)`,
        `${windowVar}.setAlwaysOnTop(!0,\`floating\`),process.platform===\`linux\`&&(${windowVar}.setSkipTaskbar(!0),${windowVar}.setAlwaysOnTop(!0,\`screen-saver\`))`,
      );
    }
    if (patchedMethod !== createWindowMethod.text) {
      patchedSource =
        patchedSource.slice(0, createWindowMethod.start) +
        patchedMethod +
        patchedSource.slice(createWindowMethod.end);
    }
  } else if (
    patchedSource.includes("avatar-overlay") &&
    !patchedSource.includes("focusable:process.platform===`linux`?!0:!1")
  ) {
    console.warn(
      "WARN: Could not find avatar overlay window creation — skipping Linux avatar overlay focusability patch",
    );
  }

  const keyboardInteractionRegex =
    /if\(this\.applyPointerInteractivityPolicy\(\),!([A-Za-z_$][\w$]*)\)\{([A-Za-z_$][\w$]*)\.setFocusable\(!1\);return\}\2\.setFocusable\(!0\),\2\.show\(\),process\.platform===`darwin`&&([A-Za-z_$][\w$]*)\.app\.focus\(\{steal:!0\}\),/;
  if (
    !/process\.platform!==`linux`&&[A-Za-z_$][\w$]*\.setFocusable\(!1\)/.test(patchedSource) &&
    keyboardInteractionRegex.test(patchedSource)
  ) {
    patchedSource = patchedSource.replace(
      keyboardInteractionRegex,
      "if(this.applyPointerInteractivityPolicy(),!$1){process.platform!==`linux`&&$2.setFocusable(!1);return}$2.setFocusable(!0),$2.show(),(process.platform===`darwin`||process.platform===`linux`)&&$3.app.focus({steal:!0}),",
    );
  }

  const closedPatchRegex =
    /this\.window===[A-Za-z_$][\w$]*&&\(this\.codexLinuxStopAvatarPassthroughRecovery\(\),this\.codexLinuxAvatarInputShapeKey=null,this\.codexLinuxMascotShape=null,this\.codexLinuxAvatarCompositorHintsApplied=!1,this\.codexLinuxAvatarCompositorHintsApplying=!1,this\.cancelMomentum\(\),[\s\S]*?this\.window=null,/;
  if (closedPatchRegex.test(patchedSource)) {
    recordStrategy("avatar-close-cleanup", "already-applied");
  } else if (
    /this\.window===[A-Za-z_$][\w$]*&&\(this\.codexLinuxStopAvatarPassthroughRecovery\(\),this\.codexLinuxAvatarInputShapeKey=null,this\.codexLinuxAvatarCompositorHintsApplied=!1,this\.codexLinuxAvatarCompositorHintsApplying=!1,this\.cancelMomentum\(\),this\.window=null,/.test(patchedSource)
  ) {
    recordStrategy("avatar-close-cleanup", "legacy:missing-mascot-shape");
    patchedSource = patchedSource.replace(
      /(this\.window===[A-Za-z_$][\w$]*&&\(this\.codexLinuxStopAvatarPassthroughRecovery\(\),this\.codexLinuxAvatarInputShapeKey=null,)(this\.codexLinuxAvatarCompositorHintsApplied=!1,)/,
      "$1this.codexLinuxMascotShape=null,$2",
    );
  } else if (/this\.window===([A-Za-z_$][\w$]*)&&\(this\.cancelMomentum\(\),this\.window=null,/.test(patchedSource)) {
    recordStrategy("avatar-close-cleanup", "upstream-simple");
    patchedSource = patchedSource.replace(
      /this\.window===([A-Za-z_$][\w$]*)&&\(this\.cancelMomentum\(\),this\.window=null,/,
      "this.window===$1&&(this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.codexLinuxMascotShape=null,this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,this.cancelMomentum(),this.window=null,",
    );
  } else if (/this\.window===([A-Za-z_$][\w$]*)&&\(this\.cancelMomentum\(\),((?:(?!this\.window=null,).)*?)this\.window=null,/.test(patchedSource)) {
    recordStrategy("avatar-close-cleanup", "upstream");
    patchedSource = patchedSource.replace(
      /this\.window===([A-Za-z_$][\w$]*)&&\(this\.cancelMomentum\(\),((?:(?!this\.window=null,).)*?)this\.window=null,/,
      "this.window===$1&&(this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.codexLinuxMascotShape=null,this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,this.cancelMomentum(),$2this.window=null,",
    );
  } else if (
    patchedSource.includes("avatar-overlay") &&
    patchedSource.includes("codexLinuxStartAvatarPassthroughRecovery")
  ) {
    recordStrategy("avatar-close-cleanup", "none");
    console.warn(
      "WARN: Could not find avatar overlay close cleanup — skipping Linux avatar overlay passthrough cleanup patch",
    );
  }

  return patchedSource;
}

module.exports = {
  applyLinuxAvatarOverlayMousePassthroughPatch,
};
