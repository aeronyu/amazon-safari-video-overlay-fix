// ==UserScript==
// @name         Amazon Safari Video Overlay Fix
// @namespace    https://github.com/aeronyu/amazon-safari-video-overlay-fix
// @version      1.0.0
// @description  Neutralize Amazon’s product video dimming overlay in Safari so playback brightness stays constant when controls appear.
// @author       aeronhidingmatcha
// @match        https://www.amazon.com/*
// @run-at       document-idle
// @license MIT
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "amazon-video-overlay-fix-style";

  const OVERLAY_SELECTORS = [
    "#a-popover-lgtbox",
    "#ivFullscreenVideoBackdrop",
    ".vjs-big-play-button",
    ".vjs-poster",
    ".dim-video-player",
    'div[class*="overlay"]',
    'div[class*="mask"]',
    'div[class*="fade"]',
    'div[class*="shade"]',
    'div[style*="rgba(0, 0, 0"]',
    'div[style*="background-color: rgba(0, 0, 0"]',
    'div[style*="background-color: black"]',
  ];

  const CONTROL_BAR_VISIBLE_CLASS = "amazon-liquid-glass-visible";
  const HOVER_HOTSPOT_CLASS = "amazon-liquid-glass-hotspot";
  const CONTROL_BEHAVIOR_REGISTRY = new WeakMap();

  const CSS_PATCH = `
    ${OVERLAY_SELECTORS.join(",\n    ")} {
      background: transparent !important;
      opacity: 0 !important;
      transition: none !important;
      pointer-events: none !important;
    }

    .dim-video-player,
    .vjs-tech.dim-video-player {
      opacity: 1 !important;
      transition: none !important;
      filter: brightness(1) !important;
      -webkit-filter: brightness(1) !important;
    }

    .video-js,
    .video-js * {
      filter: none !important;
      -webkit-filter: none !important;
    }

    .video-js video,
    video.vjs-tech {
      filter: brightness(1) !important;
      -webkit-filter: brightness(1) !important;
      opacity: 1 !important;
      transition: none !important;
      mix-blend-mode: normal !important;
      background: black !important;
    }

    .video-js {
      position: relative !important;
    }

    .video-js .vjs-control-bar {
      position: relative !important;
      background: rgba(28, 28, 30, 0.32) !important;
      border: 1px solid rgba(255, 255, 255, 0.16) !important;
      border-radius: 18px !important;
      backdrop-filter: blur(22px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(22px) saturate(180%) !important;
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35) !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transform: translateY(14px) !important;
      transition: opacity 180ms ease, transform 180ms ease !important;
      z-index: 3 !important;
    }

    .video-js .vjs-control-bar.${CONTROL_BAR_VISIBLE_CLASS} {
      opacity: 1 !important;
      pointer-events: auto !important;
      transform: translateY(0) !important;
    }

    .video-js .vjs-control-bar .vjs-control {
      color: rgba(255, 255, 255, 0.92) !important;
      text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
    }

    .video-js .vjs-progress-holder {
      background: rgba(255, 255, 255, 0.18) !important;
      border-radius: 999px !important;
      overflow: hidden !important;
    }

    .video-js .vjs-play-progress {
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.9), rgba(116, 203, 255, 0.9)) !important;
      box-shadow: 0 0 16px rgba(85, 190, 255, 0.65) !important;
    }

    .video-js .vjs-load-progress,
    .video-js .vjs-load-progress div {
      background: rgba(255, 255, 255, 0.28) !important;
    }

    .video-js .vjs-control-bar::before,
    .video-js .vjs-control-bar::after {
      display: none !important;
    }

    .video-js .${HOVER_HOTSPOT_CLASS} {
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      height: 72px !important;
      pointer-events: auto !important;
      background: transparent !important;
      z-index: 2 !important;
    }
  `;

  const VIDEO_SELECTORS = [
    ".video-js video",
    "video.vjs-tech",
    'video[id*="container-element_html5_api"]',
  ];

  const enforceInlineStyles = (element, styles) => {
    if (!element) return;
    Object.entries(styles).forEach(([property, value]) => {
      element.style.setProperty(property, value, "important");
    });
  };

  const neutralizeOverlay = (overlay) => {
    enforceInlineStyles(overlay, {
      background: "transparent",
      opacity: "0",
      transition: "none",
      pointerEvents: "none",
      mixBlendMode: "normal",
    });
  };

  const neutralizeAllOverlays = () => {
    OVERLAY_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach(neutralizeOverlay);
    });
  };

  const ensureStyleTag = () => {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const styleTag = document.createElement("style");
    styleTag.id = STYLE_ID;
    styleTag.textContent = CSS_PATCH;
    document.head.appendChild(styleTag);
  };

  const ensureHoverHotspot = (playerRoot) => {
    if (!playerRoot) {
      return null;
    }
    let hotspot = playerRoot.querySelector(`.${HOVER_HOTSPOT_CLASS}`);
    if (!hotspot) {
      hotspot = document.createElement("div");
      hotspot.className = HOVER_HOTSPOT_CLASS;
      playerRoot.appendChild(hotspot);
    }
    return hotspot;
  };

  const ensureControlBarBehavior = (playerRoot) => {
    if (!playerRoot || CONTROL_BEHAVIOR_REGISTRY.has(playerRoot)) {
      return;
    }

    const controlBar = playerRoot.querySelector(".vjs-control-bar");
    if (!controlBar) {
      return;
    }

    const hotspot = ensureHoverHotspot(playerRoot);
    const video = playerRoot.querySelector("video");

    const state = {
      hideTimer: null,
    };

    const clearHideTimer = () => {
      if (state.hideTimer) {
        clearTimeout(state.hideTimer);
        state.hideTimer = null;
      }
    };

    const hideControlBar = (delay = 0) => {
      clearHideTimer();
      if (delay === 0) {
        controlBar.classList.remove(CONTROL_BAR_VISIBLE_CLASS);
        return;
      }
      state.hideTimer = setTimeout(() => {
        controlBar.classList.remove(CONTROL_BAR_VISIBLE_CLASS);
        state.hideTimer = null;
      }, delay);
    };

    const showControlBar = (persist = false) => {
      clearHideTimer();
      controlBar.classList.add(CONTROL_BAR_VISIBLE_CLASS);
      if (!persist) {
        state.hideTimer = setTimeout(() => {
          controlBar.classList.remove(CONTROL_BAR_VISIBLE_CLASS);
          state.hideTimer = null;
        }, 2400);
      }
    };

    const showPersistent = () => showControlBar(true);
    const scheduleHide = () => hideControlBar(180);

    if (hotspot) {
      hotspot.addEventListener("mouseenter", showPersistent);
      hotspot.addEventListener("mouseleave", scheduleHide);
      hotspot.addEventListener(
        "touchstart",
        () => {
          showControlBar(true);
        },
        { passive: true }
      );
      hotspot.addEventListener(
        "touchend",
        () => {
          hideControlBar(2400);
        },
        { passive: true }
      );
      hotspot.addEventListener(
        "touchcancel",
        () => {
          hideControlBar(2400);
        },
        { passive: true }
      );
    }

    controlBar.addEventListener("mouseenter", showPersistent);
    controlBar.addEventListener("mouseleave", scheduleHide);
    controlBar.addEventListener("focusin", showPersistent);
    controlBar.addEventListener("focusout", scheduleHide);
    controlBar.addEventListener("touchstart", showPersistent, { passive: true });
    controlBar.addEventListener("touchend", scheduleHide, { passive: true });
    controlBar.addEventListener("touchcancel", scheduleHide, { passive: true });

    if (video) {
      ["pause", "play", "seeked"].forEach((eventName) => {
        video.addEventListener(eventName, () => showControlBar(false));
      });
      video.addEventListener("ended", () => showControlBar(false));
    }

    playerRoot.addEventListener("mouseleave", () => hideControlBar(0));

    showControlBar(false);
    CONTROL_BEHAVIOR_REGISTRY.set(playerRoot, {
      show: showControlBar,
      hide: hideControlBar,
    });
  };

  const reinforceVideoNodes = () => {
    VIDEO_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((video) => {
        enforceInlineStyles(video, {
          filter: "brightness(1)",
          "-webkit-filter": "brightness(1)",
          opacity: "1",
          transition: "none",
          mixBlendMode: "normal",
        });
        if (video.classList.contains("dim-video-player")) {
          video.classList.remove("dim-video-player");
        }
        const parent = video.closest(".video-js");
        enforceInlineStyles(parent, {
          position: "relative",
          background: "black",
          filter: "none",
          "-webkit-filter": "none",
        });
        ensureControlBarBehavior(parent);
        const dimParent = video.closest(".dim-video-player");
        enforceInlineStyles(dimParent, {
          opacity: "1",
          transition: "none",
        });
      });
    });
  };

  const observeMutations = () => {
    const overlayWatcher = new MutationObserver(() => {
      neutralizeAllOverlays();
      reinforceVideoNodes();
    });

    overlayWatcher.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  };

  const init = () => {
    ensureStyleTag();
    neutralizeAllOverlays();
    reinforceVideoNodes();
    observeMutations();
  };

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
