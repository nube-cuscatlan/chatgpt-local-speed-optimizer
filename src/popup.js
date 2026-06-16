const STORAGE_KEY = "cgptLocalSpeedOptimizerSettings";
const STATS_STORAGE_KEY = "cgptLocalSpeedOptimizerStats";

const DEFAULT_SETTINGS = {
  enabled: true,
  visibleTurns: 20,
  loadStep: 10,
  compactHiddenPlaceholder: true,
  useContentVisibility: false
};

const enabled = document.getElementById("enabled");
const visibleTurns = document.getElementById("visibleTurns");
const loadStep = document.getElementById("loadStep");
const save = document.getElementById("save");
const refreshStats = document.getElementById("refreshStats");

const statusBox = document.getElementById("siteStatus");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");

const statRam = document.getElementById("statRam");
const statReduction = document.getElementById("statReduction");
const statHidden = document.getElementById("statHidden");
const statRendered = document.getElementById("statRendered");

function clampNumber(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function setStatus(type, title, text) {
  statusBox.classList.remove("is-ok", "is-warning");
  if (type === "ok") statusBox.classList.add("is-ok");
  if (type === "warning") statusBox.classList.add("is-warning");
  statusTitle.textContent = title;
  statusText.textContent = text;
}

function renderStats(stats) {
  const total = Number(stats?.total || 0);
  const hidden = Number(stats?.hidden || 0);
  const visible = Number(stats?.visible || 0);
  const reduction = Number(stats?.reductionPercent || (total > 0 ? Math.round((hidden / total) * 100) : 0));
  const ram = Number(stats?.estimatedRamSavedMb || 0);

  statRam.textContent = `${ram.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
  statReduction.textContent = `${reduction}%`;
  statHidden.textContent = String(hidden);
  statRendered.textContent = `${visible} / ${total}`;
}

async function getActiveChatGptTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];

  if (!tab || !tab.id) return null;

  const url = tab.url || "";
  const isChatGpt = url.startsWith("https://chatgpt.com/") || url.startsWith("https://chat.openai.com/");

  if (!isChatGpt) return null;
  return tab;
}

async function requestLiveStats() {
  const tab = await getActiveChatGptTab();

  if (!tab) {
    setStatus("warning", "Not running on this tab", "Open or reload ChatGPT to activate the optimizer and view live stats.");
    const cached = await chrome.storage.local.get({ [STATS_STORAGE_KEY]: null });
    if (cached[STATS_STORAGE_KEY]) renderStats(cached[STATS_STORAGE_KEY]);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "cgpt-lso-get-stats" });

    if (response && response.ok && response.stats) {
      renderStats(response.stats);
      setStatus(
        response.stats.enabled ? "ok" : "warning",
        response.stats.enabled ? "Optimizer active" : "Optimizer disabled",
        response.stats.enabled
          ? "Older conversation turns are being hidden locally when the chat is long enough."
          : "Enable optimization to reduce visual load in long conversations."
      );
      return;
    }
  } catch (_error) {
    // Content script may not be injected until the page is reloaded.
  }

  setStatus("warning", "Reload ChatGPT", "The content script is not responding yet. Reload ChatGPT and open this popup again.");
}

async function loadSettings() {
  const items = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SETTINGS });
  const settings = { ...DEFAULT_SETTINGS, ...(items[STORAGE_KEY] || {}) };

  enabled.checked = Boolean(settings.enabled);
  visibleTurns.value = clampNumber(settings.visibleTurns, 1, 200, DEFAULT_SETTINGS.visibleTurns);
  loadStep.value = clampNumber(settings.loadStep, 1, 100, DEFAULT_SETTINGS.loadStep);
}

async function saveSettings() {
  const settings = {
    enabled: enabled.checked,
    visibleTurns: clampNumber(visibleTurns.value, 1, 200, DEFAULT_SETTINGS.visibleTurns),
    loadStep: clampNumber(loadStep.value, 1, 100, DEFAULT_SETTINGS.loadStep),
    compactHiddenPlaceholder: true,
    useContentVisibility: false
  };

  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });

  const tab = await getActiveChatGptTab();
  if (tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "cgpt-lso-force-apply" });
    } catch (_error) {
      // Best effort only.
    }
  }

  save.textContent = "Saved";
  window.setTimeout(() => {
    save.textContent = "Save settings";
  }, 1100);

  window.setTimeout(requestLiveStats, 150);
}

save.addEventListener("click", saveSettings);
refreshStats.addEventListener("click", requestLiveStats);

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await requestLiveStats();
});
