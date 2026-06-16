# Local Speed Optimizer for ChatGPT

Manifest V3 Chrome/Edge extension that improves performance in long ChatGPT conversations by hiding older conversation turns locally.

## Main behavior

- Keeps only the latest N conversation turns visible.
- Hides older turns locally with CSS; it does not delete or modify the conversation.
- Adds a floating `+ older` button inside ChatGPT to show older hidden messages.
- Shows local optimization statistics in the popup:
  - Estimated RAM saved.
  - Visual load reduction percentage.
  - Hidden messages.
  - Visible/total rendered messages.
- Saves settings using `chrome.storage.sync`.
- Saves last local stats using `chrome.storage.local`.
- Does not use subscriptions, license checks, analytics, tracking, external APIs, or remote code.

## Important note about RAM

The RAM value is an estimate based on hidden conversation nodes. Chrome extensions cannot directly measure exact per-message RAM usage from a content script, so the popup labels this as an estimate.

## Privacy

This extension does not send data to external servers. It does not read, copy, or transmit message content. It only counts and hides conversation DOM nodes locally on ChatGPT pages.

## Installation for testing

1. Unzip this package.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder.
6. Open or reload `https://chatgpt.com`.

## Chrome Web Store notes

Recommended permission justification:

- `storage`: used to save extension settings and local optimization statistics.
- `https://chatgpt.com/*` and `https://chat.openai.com/*`: used to apply the local DOM optimization only on ChatGPT pages.

Recommended disclosure:

Independent extension. Not affiliated with OpenAI.
