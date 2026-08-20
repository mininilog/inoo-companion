# Inoo Companion Control Panel

Unofficial public-data-derived fan companion control panel.

## Run / deployment
This is a static site: no build step, no Python/Node runtime, no `requirements.txt`, and no API key are required for recipients.

Publish the repository root with GitHub Pages and share only the final HTTPS URL.

## Security
- No direct OpenAI API calls.
- No client-side API keys.
- No free-form control input is inserted into the session configuration.
- Unknown imported settings are quarantined.
- Chat destination is restricted to `https://chatgpt.com`.
- Settings import size is limited.
- Static asset requests use timeout/retry handling.

See `SECURITY.md` for the policy.

## Privacy
The panel stores selected settings locally in the browser. It does not store or upload the user's ChatGPT conversation transcript.
