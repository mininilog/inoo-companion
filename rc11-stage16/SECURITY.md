# Security

## Current architecture
This repository is a static HTML/CSS/JavaScript control panel. It does **not** call the OpenAI API and requires **no API key**.

## Secret policy
Never place an OpenAI API key or any other credential in client-side JavaScript, HTML, JSON, or this public repository.

If a future version adds an API backend:
- keep API requests on the server side;
- load `OPENAI_API_KEY` from a server-side environment variable or secret manager;
- keep `.env` out of Git;
- do not expose the key to browsers or mobile clients.

## Prompt/config boundary
Public controls are allowlisted enum/boolean/year values. Unknown imported settings are quarantined and are not included in the active session prompt. There is no editable free-form prompt field in the public panel.

## Data handling
The panel stores only selected control settings in browser local storage. It does not store or upload chat transcripts.

## Reporting
Do not include API keys, private user data, source media, private Persona files, or checkpoints in security reports or issues.
