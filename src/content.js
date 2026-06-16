(() => {
  "use strict";

  const SINGLETON_KEY = "__cgptLocalSpeedOptimizerInstance";

  const STORAGE_KEY = "cgptLocalSpeedOptimizerSettings";
  const STATS_STORAGE_KEY = "cgptLocalSpeedOptimizerStats";
  const DEFAULT_MEMORY_PER_TURN_MB = 0.35;

  const STATE_CLASS = "cgpt-local-speed-optimizer-enabled";
  const HIDDEN_CLASS = "cgpt-lso-hidden-turn";
  const VISIBLE_OLD_CLASS = "cgpt-lso-visible-old-turn";

  const CONTROL_HOST_ID = "cgpt-lso-load-older-control-host";
  const CORE_STYLE_ID = "cgpt-lso-core-style";

  const DEFAULT_SETTINGS = {
    enabled: true,
    visibleTurns: 20,
    loadStep: 10,
    compactHiddenPlaceholder: true,
    useContentVisibility: false
  };

  if (window[SINGLETON_KEY] && typeof window[SINGLETON_KEY].destroy === "function") {
    window[SINGLETON_KEY].destroy();
  }

  let settings = { ...DEFAULT_SETTINGS };
  let extraVisibleOlderTurns = 0;
  let observer = null;
  let scheduled = false;
  let isApplying = false;
  let lastUrl = location.href;
  let destroyed = false;

  let lastStats = {
    total: 0,
    hidden: 0,
    visible: 0
  };

  window[SINGLETON_KEY] = {
    destroy() {
      destroyed = true;

      if (observer) {
        observer.disconnect();
        observer = null;
      }

      document
        .querySelectorAll(`#${CONTROL_HOST_ID}`)
        .forEach((node) => node.remove());

      const style = document.getElementById(CORE_STYLE_ID);
      if (style) style.remove();

      document.documentElement.classList.remove(STATE_CLASS);

      document
        .querySelectorAll(`.${HIDDEN_CLASS}, .${VISIBLE_OLD_CLASS}`)
        .forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.classList.remove(HIDDEN_CLASS, VISIBLE_OLD_CLASS);
          node.removeAttribute("data-cgpt-lso-hidden");
          node.style.removeProperty("display");
          node.style.removeProperty("content-visibility");
          node.style.removeProperty("contain-intrinsic-size");
        });
    }
  };

  function clampNumber(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeSettings(rawSettings) {
    const stored = rawSettings && typeof rawSettings === "object" ? rawSettings : {};

    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      enabled: Boolean(stored.enabled ?? DEFAULT_SETTINGS.enabled),
      visibleTurns: clampNumber(stored.visibleTurns, 1, 200, DEFAULT_SETTINGS.visibleTurns),
      loadStep: clampNumber(stored.loadStep, 1, 100, DEFAULT_SETTINGS.loadStep),
      compactHiddenPlaceholder: Boolean(
        stored.compactHiddenPlaceholder ?? DEFAULT_SETTINGS.compactHiddenPlaceholder
      ),
      useContentVisibility: false
    };
  }

  function getSettings() {
    return new Promise((resolve) => {
      if (!globalThis.chrome || !chrome.storage || !chrome.storage.sync) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }

      try {
        chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (items) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve({ ...DEFAULT_SETTINGS });
            return;
          }

          resolve(normalizeSettings(items[STORAGE_KEY]));
        });
      } catch (_error) {
        resolve({ ...DEFAULT_SETTINGS });
      }
    });
  }

  function injectCoreStyle() {
    let style = document.getElementById(CORE_STYLE_ID);

    if (style && style.textContent.includes("_threadScrollVars")) {
      style.remove();
      style = null;
    }

    if (style) return;

    style = document.createElement("style");
    style.id = CORE_STYLE_ID;

    style.textContent = `
      html.${STATE_CLASS} .${HIDDEN_CLASS} {
        display: none !important;
      }

      html.${STATE_CLASS} .${VISIBLE_OLD_CLASS} {
        opacity: 0.98;
      }

      html.${STATE_CLASS} [data-testid^="conversation-turn-"]:focus,
      html.${STATE_CLASS} [data-testid^="conversation-turn-"]:focus-visible,
      html.${STATE_CLASS} [data-message-author-role]:focus,
      html.${STATE_CLASS} [data-message-author-role]:focus-visible,
      html.${STATE_CLASS} main article:focus,
      html.${STATE_CLASS} main article:focus-visible,
      html.${STATE_CLASS} main section:focus,
      html.${STATE_CLASS} main section:focus-visible,
      html.${STATE_CLASS} main div[tabindex="-1"]:focus,
      html.${STATE_CLASS} main div[tabindex="-1"]:focus-visible {
        outline: none !important;
        box-shadow: none !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function cleanupBadPreviousPatch() {
    document.documentElement.style.removeProperty("overflow-x");

    if (document.body && document.body.style) {
      document.body.style.removeProperty("overflow-x");
    }

    const style = document.getElementById(CORE_STYLE_ID);
    if (style && style.textContent.includes("_threadScrollVars")) {
      style.remove();
    }

    document
      .querySelectorAll(`#${CONTROL_HOST_ID}`)
      .forEach((node, index) => {
        if (index > 0) node.remove();
      });
  }

  function isInsideInvalidArea(node) {
    if (!(node instanceof HTMLElement)) return true;

    return Boolean(
      node.closest("form") ||
      node.closest('[role="dialog"]') ||
      node.closest('[data-radix-popper-content-wrapper]') ||
      node.closest(`#${CONTROL_HOST_ID}`) ||
      node.closest("nav") ||
      node.closest("aside") ||
      node.closest("header") ||
      node.closest("[data-cgpt-lso-ui]")
    );
  }

  function getTurnIdentity(node) {
    if (!(node instanceof HTMLElement)) return "";

    const dataTurnIdContainer = node.getAttribute("data-turn-id-container");
    if (dataTurnIdContainer) return `container:${dataTurnIdContainer}`;

    const dataTestId = node.getAttribute("data-testid");
    if (dataTestId) return `testid:${dataTestId}`;

    const dataTurnId = node.getAttribute("data-turn-id");
    if (dataTurnId) return `turn:${dataTurnId}`;

    const messageId =
      node.getAttribute("data-message-id") ||
      node.querySelector("[data-message-id]")?.getAttribute("data-message-id");

    if (messageId) return `message:${messageId}`;

    return "";
  }

  function dedupeTurns(nodes) {
    const result = [];
    const seenNodes = new Set();
    const seenKeys = new Set();

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!document.documentElement.contains(node)) continue;
      if (isInsideInvalidArea(node)) continue;
      if (seenNodes.has(node)) continue;

      const key = getTurnIdentity(node);
      if (!key) continue;
      if (seenKeys.has(key)) continue;

      seenNodes.add(node);
      seenKeys.add(key);

      result.push(node);
    }

    result.sort((a, b) => {
      const position = a.compareDocumentPosition(b);

      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;

      return 0;
    });

    return result;
  }

  function getOuterTurnContainer(node) {
    if (!(node instanceof HTMLElement)) return null;

    const outer = node.closest("[data-turn-id-container]");
    if (outer instanceof HTMLElement) return outer;

    return node;
  }

  function findTurns() {
    const main = document.querySelector("main");
    const root = main instanceof HTMLElement ? main : document.body;

    const sections = Array.from(
      root.querySelectorAll('[data-testid^="conversation-turn-"]')
    ).filter((node) => {
      if (!(node instanceof HTMLElement)) return false;

      const id = node.getAttribute("data-testid") || "";
      return /^conversation-turn-\d+$/.test(id);
    });

    const containers = sections
      .map(getOuterTurnContainer)
      .filter((node) => node instanceof HTMLElement);

    return dedupeTurns(containers);
  }

  function resetTurn(turn) {
    if (!(turn instanceof HTMLElement)) return;

    turn.classList.remove(HIDDEN_CLASS, VISIBLE_OLD_CLASS);
    turn.removeAttribute("data-cgpt-lso-hidden");
    turn.style.removeProperty("display");
    turn.style.removeProperty("content-visibility");
    turn.style.removeProperty("contain-intrinsic-size");
  }

  function removeDuplicateControls() {
    const hosts = Array.from(document.querySelectorAll(`#${CONTROL_HOST_ID}`));

    if (hosts.length <= 1) return;

    hosts.slice(1).forEach((node) => node.remove());
  }

  function ensureControl() {
    removeDuplicateControls();

    let host = document.getElementById(CONTROL_HOST_ID);

    if (host) {
      Object.assign(host.style, {
        position: "fixed",
        right: "16px",
        bottom: "92px",
        left: "auto",
        top: "auto",
        inset: "auto 16px 92px auto",
        zIndex: "2147483647",
        pointerEvents: "none",
        width: "auto",
        maxWidth: "260px",
        display: "flex",
        justifyContent: "flex-end",
        contain: "layout style paint",
        transform: "none"
      });

      return host;
    }

    host = document.createElement("div");
    host.id = CONTROL_HOST_ID;
    host.setAttribute("data-cgpt-lso-ui", "true");

    Object.assign(host.style, {
      position: "fixed",
      right: "16px",
      bottom: "92px",
      left: "auto",
      top: "auto",
      inset: "auto 16px 92px auto",
      zIndex: "2147483647",
      pointerEvents: "none",
      width: "auto",
      maxWidth: "260px",
      display: "flex",
      justifyContent: "flex-end",
      contain: "layout style paint",
      transform: "none"
    });

    const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

    root.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .wrap {
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          max-width: 260px;
          padding: 5px 6px;
          border: 1px solid rgba(255,255,255,.20);
          border-radius: 999px;
          background: rgba(17,24,39,.94);
          color: rgba(255,255,255,.95);
          box-shadow: 0 8px 22px rgba(0,0,0,.30);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          line-height: 1.15;
          pointer-events: auto;
        }

        button {
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,.24);
          border-radius: 999px;
          padding: 6px 8px;
          background: rgba(255,255,255,.14);
          color: inherit;
          font: inherit;
          font-size: 11px;
          font-weight: 750;
          white-space: nowrap;
        }

        button:hover {
          background: rgba(255,255,255,.20);
        }

        button:active {
          transform: translateY(1px);
        }

        button:disabled {
          cursor: default;
          opacity: .75;
        }

        .hide-button {
          display: none;
        }

        .hide-button.is-visible {
          display: inline-flex;
        }

        .status {
          overflow: hidden;
          max-width: 72px;
          color: rgba(255,255,255,.72);
          font-size: 10px;
          font-weight: 550;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (prefers-color-scheme: light) {
          .wrap {
            border-color: rgba(15,23,42,.14);
            background: rgba(255,255,255,.96);
            color: rgba(15,23,42,.94);
            box-shadow: 0 8px 22px rgba(15,23,42,.16);
          }

          button {
            border-color: rgba(15,23,42,.14);
            background: rgba(15,23,42,.08);
          }

          button:hover {
            background: rgba(15,23,42,.12);
          }

          .status {
            color: rgba(15,23,42,.62);
          }
        }

        @media (max-width: 920px) {
          .status {
            display: none;
          }

          .wrap {
            max-width: 190px;
          }

          button {
            font-size: 11px;
            padding: 6px 8px;
          }
        }
      </style>

      <div class="wrap">
        <button class="show-button" type="button">+ older</button>
        <button class="hide-button" type="button">Hide</button>
        <span class="status"></span>
      </div>
    `;

    const showButton = root.querySelector(".show-button");
    const hideButton = root.querySelector(".hide-button");

    showButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const firstVisibleTurn = findFirstVisibleTurn();
      const previousTop = firstVisibleTurn
        ? firstVisibleTurn.getBoundingClientRect().top
        : null;

      extraVisibleOlderTurns += settings.loadStep;

      scheduleApply();

      window.requestAnimationFrame(() => {
        removeDuplicateControls();

        if (!firstVisibleTurn || previousTop === null) return;

        const newTop = firstVisibleTurn.getBoundingClientRect().top;
        const delta = newTop - previousTop;

        if (Math.abs(delta) > 1) {
          window.scrollBy({
            top: delta,
            left: 0
          });
        }
      });
    });

    hideButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      extraVisibleOlderTurns = Math.max(0, extraVisibleOlderTurns - settings.loadStep);
      scheduleApply();

      window.requestAnimationFrame(() => {
        removeDuplicateControls();
      });
    });

    (document.body || document.documentElement).appendChild(host);

    return host;
  }

  function getControlParts() {
    const host = document.getElementById(CONTROL_HOST_ID);

    if (!host) {
      return {
        showButton: null,
        hideButton: null,
        status: null
      };
    }

    const root = host.shadowRoot || host;

    return {
      showButton: root.querySelector(".show-button"),
      hideButton: root.querySelector(".hide-button"),
      status: root.querySelector(".status")
    };
  }

  function removeControl() {
    document
      .querySelectorAll(`#${CONTROL_HOST_ID}`)
      .forEach((node) => node.remove());
  }

  function positionControlFixed() {
    const host = document.getElementById(CONTROL_HOST_ID);
    if (!host || host.hidden) return;

    Object.assign(host.style, {
      position: "fixed",
      right: "16px",
      bottom: "92px",
      left: "auto",
      top: "auto",
      inset: "auto 16px 92px auto",
      transform: "none"
    });
  }

  function findFirstVisibleTurn() {
    const turns = findTurns();

    for (const turn of turns) {
      if (!(turn instanceof HTMLElement)) continue;
      if (turn.classList.contains(HIDDEN_CLASS)) continue;

      const rect = turn.getBoundingClientRect();

      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        return turn;
      }
    }

    return null;
  }



  function calculateStatsSnapshot() {
    const total = Number(lastStats.total || 0);
    const hidden = Number(lastStats.hidden || 0);
    const visible = Number(lastStats.visible || 0);
    const reductionPercent = total > 0 ? Math.round((hidden / total) * 100) : 0;
    const estimatedRamSavedMb = Math.round(hidden * DEFAULT_MEMORY_PER_TURN_MB * 10) / 10;

    return {
      total,
      hidden,
      visible,
      reductionPercent,
      estimatedRamSavedMb,
      estimatedRamMethod: "hidden_turns_x_average_dom_weight",
      estimatedRamNote: "Estimated only. Chrome extensions cannot directly measure exact per-message RAM usage.",
      enabled: Boolean(settings.enabled),
      visibleTurns: settings.visibleTurns,
      loadStep: settings.loadStep,
      extraVisibleOlderTurns,
      updatedAt: new Date().toISOString()
    };
  }

  function persistStatsSnapshot() {
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) return;

    try {
      chrome.storage.local.set({ [STATS_STORAGE_KEY]: calculateStatsSnapshot() });
    } catch (_error) {
      // Best-effort cache only.
    }
  }

  function applyOptimization() {
    if (destroyed || isApplying) return;

    isApplying = true;

    try {
      cleanupBadPreviousPatch();
      injectCoreStyle();

      const turns = findTurns();

      if (!settings.enabled) {
        document.documentElement.classList.remove(STATE_CLASS);
        removeControl();
        turns.forEach(resetTurn);

        lastStats = {
          total: turns.length,
          hidden: 0,
          visible: turns.length
        };
        persistStatsSnapshot();

        return;
      }

      document.documentElement.classList.add(STATE_CLASS);

      const total = turns.length;

      if (total === 0) {
        removeControl();

        lastStats = {
          total: 0,
          hidden: 0,
          visible: 0
        };
        persistStatsSnapshot();

        return;
      }

      const visibleTail = clampNumber(
        settings.visibleTurns,
        1,
        200,
        DEFAULT_SETTINGS.visibleTurns
      );

      const safeVisibleTail = Math.min(total, Math.max(1, visibleTail));
      const totalVisible = Math.min(total, safeVisibleTail + extraVisibleOlderTurns);
      const hideCount = Math.max(0, total - totalVisible);

      turns.forEach((turn, index) => {
        resetTurn(turn);

        if (index < hideCount) {
          turn.classList.add(HIDDEN_CLASS);
          turn.setAttribute("data-cgpt-lso-hidden", "true");
        } else if (index < total - safeVisibleTail) {
          turn.classList.add(VISIBLE_OLD_CLASS);
        }
      });

      lastStats = {
        total,
        hidden: hideCount,
        visible: total - hideCount
      };
      persistStatsSnapshot();

      const host = ensureControl();
      const { showButton, hideButton, status } = getControlParts();

      if (hideCount > 0 || extraVisibleOlderTurns > 0) {
        host.hidden = false;

        if (showButton) {
          showButton.disabled = hideCount <= 0;
          showButton.textContent =
            hideCount > 0
              ? `+${Math.min(settings.loadStep, hideCount)} older`
              : "All visible";
        }

        if (hideButton) {
          hideButton.classList.toggle("is-visible", extraVisibleOlderTurns > 0);
          hideButton.textContent = `-${Math.min(settings.loadStep, extraVisibleOlderTurns)} hide`;
        }

        if (status) {
          status.textContent = hideCount > 0 ? `${hideCount} hidden` : "0 hidden";
        }

        positionControlFixed();
      } else {
        host.hidden = true;

        if (showButton) {
          showButton.disabled = true;
          showButton.textContent = "All visible";
        }

        if (hideButton) {
          hideButton.classList.remove("is-visible");
        }

        if (status) {
          status.textContent = `${total}/${total}`;
        }
      }

      removeDuplicateControls();
    } finally {
      isApplying = false;
    }
  }

  function scheduleApply() {
    if (destroyed || scheduled) return;

    scheduled = true;

    const run = () => {
      scheduled = false;
      applyOptimization();
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
    } else {
      window.setTimeout(run, 16);
    }
  }

  async function reloadSettingsAndApply() {
    settings = await getSettings();
    extraVisibleOlderTurns = 0;
    scheduleApply();
  }

  function setupObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      if (destroyed || isApplying) return;

      if (location.href !== lastUrl) {
        lastUrl = location.href;
        extraVisibleOlderTurns = 0;
      }

      scheduleApply();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function setupStorageListener() {
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.onChanged) return;

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (destroyed) return;
      if (areaName !== "sync") return;
      if (!changes[STORAGE_KEY]) return;

      settings = normalizeSettings(changes[STORAGE_KEY].newValue || {});
      extraVisibleOlderTurns = 0;
      scheduleApply();
    });
  }

  function isInteractiveElement(node) {
    if (!(node instanceof HTMLElement)) return false;

    return Boolean(
      node.closest("textarea") ||
      node.closest("input") ||
      node.closest("button") ||
      node.closest("select") ||
      node.closest("a[href]") ||
      node.closest('[contenteditable="true"]') ||
      node.closest('[role="button"]') ||
      node.closest('[role="textbox"]')
    );
  }

  function clearNonInteractiveFocusAfterScrollKey(event) {
    const keys = new Set(["Home", "End", "PageUp", "PageDown", " "]);

    if (!keys.has(event.key)) return;

    window.setTimeout(() => {
      const active = document.activeElement;

      if (!(active instanceof HTMLElement)) return;
      if (active === document.body || active === document.documentElement) return;
      if (isInteractiveElement(active)) return;

      active.blur();
    }, 0);
  }

  function setupRuntimeMessageListener() {
    if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (destroyed) return false;
      if (!message || typeof message !== "object") return false;

      if (message.type === "cgpt-lso-get-stats") {
        sendResponse({
          ok: true,
          stats: calculateStatsSnapshot()
        });

        return true;
      }

      if (message.type === "cgpt-lso-force-apply") {
        scheduleApply();
        sendResponse({ ok: true });
        return true;
      }

      return false;
    });
  }

  function setupLifecycleListeners() {
    window.addEventListener("pageshow", scheduleApply, { passive: true });
    window.addEventListener("focus", scheduleApply, { passive: true });
    window.addEventListener("resize", scheduleApply, { passive: true });
    window.addEventListener("scroll", positionControlFixed, { passive: true });
    window.addEventListener("keydown", clearNonInteractiveFocusAfterScrollKey, true);

    window.setInterval(() => {
      if (destroyed) return;

      const host = document.getElementById(CONTROL_HOST_ID);

      if (settings.enabled && (lastStats.hidden > 0 || extraVisibleOlderTurns > 0) && !host) {
        scheduleApply();
        return;
      }

      removeDuplicateControls();
      positionControlFixed();
    }, 1200);
  }

  cleanupBadPreviousPatch();
  injectCoreStyle();
  setupStorageListener();
  setupRuntimeMessageListener();
  setupObserver();
  setupLifecycleListeners();
  reloadSettingsAndApply();
})();