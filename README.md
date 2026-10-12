# ⚡ Calendar Agent

> A local-first, AI-powered calendar assistant that lets you manage your schedule using natural language.

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue.svg)](https://www.typescriptlang.org/)

**Calendar Agent is a personal project exploring how AI can move beyond answering questions and actually help manage everyday tasks.**

Instead of manually navigating a calendar to create events, check availability, or modify meetings, you can describe what you want in natural language and let the application handle the scheduling workflow.

The interface uses a retro-inspired visual style, while the underlying idea is practical: combine natural-language interaction with reliable scheduling logic and give users control over their data and AI provider.

### Quick Links

[🚀 Quickstart](#-quickstart) 

[✨ Features](#-features) 


[🖥️ Screenshots(not yet uploaded)](#️-screenshots) 

[🤖 AI Providers](#-supported-ai-providers) 

[🔐 Privacy](#-privacy-and-data-handling) 

[🛠️ Troubleshooting](#️-troubleshooting) 

[🤝 Contributing](#-contributing)

---

## ✨ Features

- **💬 AI-Powered Scheduling** — Create, update, and cancel events using natural language.
- **📅 Smart Calendar** — View your schedule, check availability, and detect time conflicts.
- **🔌 Flexible AI Providers** — Bring your own API key or run local models with Ollama.
- **🔒 Local-First Storage** — Keep calendar data on your machine when configured for local storage.
- **📤 Calendar Export** — Export events as `.ics` files.
- **🎨 Retro-Inspired UI** — A distinctive calendar interface with warm colors and a desk-organizer aesthetic.

> Features depend on the current implementation and configuration.

## 🖥️ Screenshots

<!-- Add screenshots of the application here. -->

<!-- Example:
![Calendar Agent dashboard](./docs/screenshots/dashboard.png)
-->

Screenshots and a live demo will be added once the application is deployed.

---

## 🚀 Quickstart

### Prerequisites

Before running the application, install:

- [Node.js](https://nodejs.org/) — Version 18 or later, if compatible with the current project dependencies.
- [Git](https://git-scm.com/)
- An API key from a supported AI provider, or [Ollama](https://ollama.com/) for local model inference.

### 1. Clone the repository

```bash
git clone https://github.com/ma-eswar/calendar-agent.git
cd calendar-agent
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

### 4. Open the application

Open the local URL displayed in your terminal.

If the application uses port `3000`, visit:

**http://127.0.0.1:3000**



### 5. Configure your AI provider

If the application setup wizard is available:

1. Select your preferred AI provider.
2. Enter your API key, or configure your local Ollama model.
3. Test the connection.
4. Save the configuration.
5. Start interacting with your calendar.

**Tip:** If the application does not start at the expected address, check the terminal output and the project's configuration.

> **💡 Note:** The `events.json` file may contain demo events. Feel free to remove the demo data and add your own events to make the calendar yours!


## 🤖 Supported AI Providers

Calendar Agent is designed to support different AI providers so that users can choose a model based on their requirements, budget, and preferred setup.

Model availability, identifiers, pricing, and free-tier limits can change. Check the providers' official documentation before configuring a model.

| Provider | Example model or option | Access | Setup |
|---|---|---|---|
| **Groq** | `openai/gpt-oss-120b`, if available to your account | Provider-specific limits and pricing | [API Keys](https://console.groq.com/keys) · [Models](https://console.groq.com/docs/models) |
| **OpenRouter** | `openrouter/free` | Free routing options may have rate limits and changing availability | [API Keys](https://openrouter.ai/keys) · [Pricing](https://openrouter.ai/pricing) |
| **Google Gemini** | A currently supported Gemini model | Free-tier availability depends on the model and account | [Get an API Key](https://aistudio.google.com/app/apikey) · [Models](https://ai.google.dev/gemini-api/docs/models) |
| **OpenAI** | `gpt-4o-mini`, if available for your use case | Pay-as-you-go API pricing | [API Keys](https://platform.openai.com/api-keys) · [Pricing](https://openai.com/api/pricing/) |
| **Ollama** | `qwen2.5:7b` or `llama3.2` | Local inference using your own hardware | [Website](https://ollama.com/) · [Model Library](https://ollama.com/library) |

**Important:** The table lists possible model options, not a guarantee that every model is currently available or compatible with every version of Calendar Agent. Use the exact model identifier supported by your provider and application integration.

### Using Ollama for Local Inference

Ollama lets you run supported language models on your own machine.

For example:

```bash
ollama run qwen2.5:7b
```

Install Ollama first, download a model, and configure Calendar Agent to connect to your local Ollama instance using the endpoint and model name expected by the application.

Local inference can avoid sending prompts to a cloud AI provider for model processing. However, it requires sufficient system resources, and other application features may still make network requests.

---

## 🔐 Privacy and Data Handling

**Local-first storage and private AI processing are not the same thing.**

Calendar Agent is designed to give users control over their calendar storage and their choice of AI provider. The actual privacy characteristics depend on the selected configuration and how the application handles data.

### Local Storage

When configured to use local storage, calendar events can remain on your machine rather than being stored in a third-party calendar database.

For example, the application may use an `events.json` file to store event data.

Local storage alone does not guarantee encryption, secure backups, or protection against other users who have access to your device.

### Cloud AI Providers

When you use Groq, OpenRouter, Google Gemini, OpenAI, or another cloud AI provider, information included in AI requests is sent to that provider.

Depending on the request and implementation, this information may include:

- Event titles
- Dates and times
- Meeting locations
- Event descriptions or notes
- Other calendar context included in the prompt

Review the provider's privacy policy and data-handling terms before sending sensitive information.

### Bring Your Own Key (BYOK)

BYOK means you supply your own provider API key.

The application uses that key to authenticate with the selected provider. This gives you more control over provider selection and usage, but **it does not prevent the provider from receiving the information sent in AI requests**.

Never commit API keys or other secrets to Git.

### Local AI with Ollama

When configured to use a local Ollama model, AI inference can run on your own machine without sending prompts to a cloud model provider.

For a fully offline workflow, you must also verify that the application does not make other external requests and that the local model is already installed.

### Privacy Summary

| Configuration | Calendar storage | AI processing |
|---|---|---|
| Local storage + cloud AI | Local, if configured that way | Relevant request data is sent to the selected provider |
| Local storage + local Ollama | Local, if configured that way | Model inference runs locally |
| Fully offline configuration | Local | Possible only if all required components work locally and external requests are disabled |

Calendar Agent should not be described as universally or completely private without verifying its actual network behavior and storage implementation.

---

## 💬 Example Commands

The following examples illustrate the intended interaction style. Exact command support depends on the application's current implementation.

### Create Events

```text
Coffee with Sarah tomorrow at 5 PM.
```

```text
Schedule a 90-minute deep-work session on Thursday starting at 2 PM.
```

### Check for Scheduling Conflicts

```text
Schedule a catch-up on October 15 at 10 AM.
```

The application should check existing events for overlapping time intervals before creating the event, provided that conflict checking is implemented for the operation.

### Find Available Time

```text
Find a free one-hour slot between my meetings on October 16.
```

```text
What events do I have scheduled this week?
```

### Update an Event

```text
Add Room 402 to my meeting tomorrow.
```

### Cancel an Event

```text
Cancel my Coffee with Sarah event.
```

For important appointments, review the resulting event details and confirm that changes were saved correctly.

---

## 🧮 Scheduling Reliability

AI models are useful for interpreting natural-language requests, but they should not be the sole authority for calendar operations.

A reliable scheduling workflow separates language understanding from deterministic application logic:

1. **Interpret the request:** Extract the intended event, date, time, duration, and other relevant details.
2. **Validate the input:** Check that required information is present and that the date and time are valid.
3. **Check availability:** Compare the proposed interval with existing events.
4. **Resolve conflicts:** Ask for clarification or suggest alternatives when a conflict is detected.
5. **Execute the operation:** Create or update the event only after the necessary checks.
6. **Confirm the result:** Report what was actually saved.

The goal is to avoid relying on an AI-generated statement such as "you are free at 2 PM" without checking the underlying calendar data.

> The reliability of this workflow depends on the actual validation, conflict-checking, and persistence logic implemented in the project.

---

## 🛠️ Available Scripts

The following commands are expected to be available in the project. Confirm them against `package.json`.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build or compile the application |
| `npm start` | Start the production build |

If a command is unavailable, inspect the `scripts` section of `package.json`.

---

## 🧯 Troubleshooting

### Port 3000 Is Already in Use

If the application supports the `PORT` environment variable, use a different port.

**Linux / macOS:**

```bash
PORT=3001 npm run dev
```

**Windows PowerShell:**

```powershell
$env:PORT="3001"; npm run dev
```

Open `http://127.0.0.1:3001` if the server starts on that port.

If the application does not respect `PORT`, check the server configuration.

### Native Dependency or `esbuild` Errors

Native dependencies may differ between Windows, Linux, and macOS.

If you switch between Windows and Linux/WSL, avoid sharing the same `node_modules` directory between environments. Reinstall dependencies inside the environment where you intend to run the application.

On Linux/macOS:

```bash
rm -rf node_modules
npm install
```

On Windows, remove `node_modules` using PowerShell or File Explorer, then run:

```bash
npm install
```

Do not manually add a platform-specific `esbuild` package unless the error message or project documentation indicates that it is necessary.

### AI Provider Connection Errors

If an AI request fails:

- Verify that the API key is valid.
- Confirm that the model identifier is currently supported.
- Check account access, usage limits, and billing requirements.
- Inspect the application logs for the provider's error message.
- For Ollama, confirm that the service is running and that the configured endpoint is correct.

Never publish API keys, authentication headers, or sensitive calendar data when sharing error logs.

### Events Are Not Being Saved

If an event appears in chat but not in the calendar:

- Refresh the calendar and check whether the event persisted.
- Inspect the application's event storage configuration.
- Check for file permission or database errors.
- Verify that the AI response represents a completed operation rather than a proposed action.

A conversational confirmation should not be treated as proof that an event was saved.

---

## 🧭 Design and Project Philosophy

Calendar Agent combines a practical scheduling workflow with a retro-inspired visual interface.

The design direction is an exploration rather than a requirement for how a calendar assistant must look. The core focus is the interaction between natural language, calendar data, and reliable application logic.

The project explores a few principles:

- **User control:** Make calendar data accessible and understandable.
- **Provider choice:** Allow users to choose among supported AI options.
- **Predictable operations:** Validate scheduling actions with application logic.
- **Transparent privacy:** Explain what stays local and what may be sent to a cloud provider.
- **Practical AI:** Use AI to help perform useful tasks, not merely produce conversational responses.

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a branch for your change.
3. Implement and test your changes.
4. Open a pull request explaining what changed and how you tested it.

When reporting issues, include relevant steps to reproduce the problem and sanitized error messages.

Please do not include API keys, private calendar events, meeting notes, or other sensitive information in issues, screenshots, test fixtures, or pull requests.

---

## 📄 License

This project is intended to be distributed under the MIT License.

See [`LICENSE`](./LICENSE) for the actual license terms. Ensure that this file exists and contains the correct license before describing the project as MIT-licensed.

---

**Calendar Agent — a personal exploration of AI-assisted scheduling, local-first software, and a different approach to calendar design.**