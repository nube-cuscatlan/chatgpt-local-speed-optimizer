# Local Speed Optimizer for ChatGPT

A lightweight Manifest V3 browser extension for Chrome and Edge that helps long ChatGPT conversations feel faster by hiding older rendered conversation turns locally.

The extension does not delete, edit, upload, or summarize your conversations. It only reduces the amount of old visible conversation content rendered on the page.

> Independent project. Not affiliated with, endorsed by, or sponsored by OpenAI.

## What it does

Local Speed Optimizer keeps the most recent conversation turns visible and hides older rendered turns using local CSS. This can reduce visual clutter and may improve responsiveness in very long ChatGPT chats.

Main features:

* Keeps only the latest configurable number of conversation turns visible.
* Hides older turns locally without deleting or modifying the conversation.
* Adds a floating `+ older` button to reveal hidden older messages.
* Shows local optimization statistics in the extension popup:

  * Estimated RAM saved.
  * Estimated visual load reduction.
  * Hidden messages.
  * Visible and total rendered messages.
* Saves user settings with `chrome.storage.sync`.
* Saves the latest local optimization stats with `chrome.storage.local`.
* Works only on ChatGPT pages:

  * `https://chatgpt.com/*`
  * `https://chat.openai.com/*`

## What it does not do

This extension does not:

* Collect message content.
* Send data to external servers.
* Use analytics or tracking.
* Use external APIs.
* Inject remote code.
* Require an account, subscription, license key, or payment.
* Modify your saved ChatGPT conversation history.

## Important note about RAM estimates

The RAM value shown in the popup is an estimate based on hidden conversation nodes.

Chrome extensions cannot directly measure exact per-message memory usage from a content script, so the extension labels this value as an estimate.

## Privacy

Local Speed Optimizer runs locally in your browser.

It only counts and hides rendered conversation DOM nodes on supported ChatGPT pages. It does not read, copy, store, transmit, or sell message content.

For more details, see `PRIVACY.md`.

## Installation for local testing

1. Download or clone this repository.
2. Unzip the package if needed.
3. Open `chrome://extensions` or `edge://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the extension folder.
7. Open or reload `https://chatgpt.com`.

## Permissions

This extension uses minimal permissions:

### `storage`

Used to save extension settings and local optimization statistics.

### `https://chatgpt.com/*`

Used to apply the local DOM optimization only on ChatGPT pages.

### `https://chat.openai.com/*`

Included for compatibility with older ChatGPT URLs.

## Support the project

This extension is free and open source under the MIT License.

If it saves you time or you want to support maintenance, you can donate through Ko-fi:

[Support on Ko-fi](https://ko-fi.com/nubecuscatlan)

Donations are optional. They do not unlock hidden features, tracking, subscriptions, license checks, or paid-only behavior.

## Development notes

This project is intentionally small.

The goal is to keep the extension simple, transparent, and easy to audit. Contributions should avoid unnecessary permissions, external dependencies, remote scripts, analytics, or behavior unrelated to local ChatGPT page optimization.

## Chrome Web Store notes

Recommended permission justification:

* `storage`: used to save extension settings and local optimization statistics.
* `https://chatgpt.com/*` and `https://chat.openai.com/*`: used to apply the local DOM optimization only on ChatGPT pages.

Recommended disclosure:

Independent extension. Not affiliated with OpenAI.

Recommended privacy summary:

This extension does not collect, transmit, sell, or share user data. It performs local DOM optimization on supported ChatGPT pages only.

## License

MIT License.

See `LICENSE` for details.
