# Chrome Web Store submission checklist

## Single purpose

Improves local performance in long ChatGPT conversations by hiding older rendered conversation turns.

## Permission justification

### storage
Used to save local user settings and local optimization statistics.

### Host permissions
`https://chatgpt.com/*` and `https://chat.openai.com/*` are required because the extension only works on ChatGPT pages and needs to hide/show conversation DOM nodes locally.

## Privacy disclosure

- No message content is collected.
- No personal information is collected.
- No analytics are used.
- No external APIs are called.
- No remote code is loaded.
- No subscription or account system exists.

## Suggested short description

Hide older ChatGPT messages locally to reduce visual load in long conversations. Free, local-only, no tracking.

## Suggested full description

Local Speed Optimizer for ChatGPT improves responsiveness in long conversations by hiding older rendered messages locally. Your conversation is not deleted or modified; older turns are simply hidden from the current page and can be shown again with the built-in button.

Features:
- Keep the most recent messages visible.
- Show older messages on demand.
- View estimated RAM saved and visual load reduction.
- Configure how many messages stay visible.
- Works locally in the browser.
- No subscriptions, no tracking, no external APIs.

Independent extension. Not affiliated with OpenAI.
