# KnowBridge Chat System

A comprehensive, AI-powered customer support and chat platform. KnowBridge (formerly EduCtrl) seamlessly integrates real-time agent-to-customer chat with an intelligent Knowledge Base, capable of answering queries contextually using advanced vector search and OpenAI embeddings. 

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Local Installation](#local-installation)
- [Environment Variables](#environment-variables)
- [How to Use the Platform](#how-to-use-the-platform)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Features

- **Real-time Chat Engine** — Socket.IO-powered live messaging between support agents and customers/students.
- **AI Knowledge Base (RAG)** — Upload PDFs, paste raw text, or use the built-in web crawler to ingest documentation. Documents are chunked and stored as vector embeddings using `pgvector`.
- **Intelligent Web Crawler** — Automatically crawl and scrape pages from a base URL, respecting exclusions, to keep your AI trained on your latest website content.
- **Smart AI Responses** — Leverages OpenAI's embedding models (`text-embedding-3-small` / `large`) and LLMs to provide context-aware, highly accurate support responses directly from your uploaded materials.
- **Role-based Access Control (RBAC)** — Distinct roles for System Admins (who can manage integrations and system settings) and Support Agents.
- **Live Notifications** — Real-time alerts for chat assignments, escalations, and system updates.
- **Tenant & Agent Isolation** — Advanced schema design to ensure data is safely partitioned and routed to the correct support agents.

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL 15/16+ with `pgvector` extension |
| **Real-time** | Socket.IO |
| **AI / LLM** | OpenAI API, LangChain.js |
| **Admin Dashboard** | React 18, Vite, Tailwind CSS |
| **Chat Widget** | React (Embeddable Widget) |

## Prerequisites

- Node.js 18+
- PostgreSQL (with the `pgvector` extension installed). **Highly Recommended**: Use the `ankane/pgvector` Docker image to avoid local extension compilation issues.
- An active **OpenAI API Key**

## Local Installation

```bash
# Clone the repository
git clone <this-repo-url>
cd knowbridge
```

### 1. Database Setup (Docker - Recommended)
Since the system requires the `pgvector` extension for AI search, the easiest way to run the database is via Docker:
```bash
docker run -d --name pgvector-db -e POSTGRES_PASSWORD=your_password -p 5435:5432 ankane/pgvector
```
*(Once running, connect to this container on port 5435 and create a database named `knowbridge`)*

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env        # Fill in your database and OpenAI credentials
npm run migrate             # Runs all SQL migrations automatically
npm run dev                 # Starts the API server on http://localhost:5000
```

### 3. Admin Dashboard Setup
```bash
# Open a new terminal
cd admin-dashboard
npm install
cp .env.example .env
npm run dev                 # Starts the dashboard on http://localhost:3000
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `PORT` | No | Defaults to `5000` |
| `DB_HOST` | Yes | Database host (e.g., `localhost`) |
| `DB_PORT` | Yes | Database port (e.g., `5435` if using the Docker setup above) |
| `DB_NAME` | Yes | Target database name (e.g., `knowbridge`) |
| `DB_USER` / `DB_PASSWORD` | Yes | Database credentials |
| `OPENAI_API_KEY` | Yes | Your secret OpenAI API key (`sk-proj-...`) |
| `OPENAI_EMBEDDING_MODEL` | No | E.g., `text-embedding-3-small` |
| `OPENAI_MODEL` | No | E.g., `gpt-3.5-turbo` or `gpt-4o` |
| `NODE_OPTIONS` | No | Set to `--dns-result-order=ipv4first` if you experience OpenAI connection hangups |

## How to Use the Platform

1. **Login**: Use the demo admin credentials (`knownbridge@test.com` / `test123`) to log into the Admin Dashboard.
2. **Train the AI**: Navigate to the **Knowledge Base** tab.
   - Upload PDF guides or paste raw text.
   - Use the **URL Crawler** to point the system at your company documentation. Set a max page limit and click "Start Crawl". 
3. **Embed the Widget**: Integrate the code from the `eductrl-chat-widget-new` folder into your frontend website to allow customers to start chatting.
4. **Chat & Escalate**: As customers ask questions, the AI will attempt to answer them using the vector database. If the AI cannot help, the chat is escalated to a human agent, triggering a real-time notification on the dashboard.

## Project Structure

```text
knowbridge/
├── admin-dashboard/          # React SPA for support staff and admins
│   ├── src/pages/            # Dashboard, Knowledge Base, Chat views
│   └── src/components/       # Reusable UI elements (Tailwind)
├── backend/                  # Node.js Express API Server
│   ├── database/migrations/  # Sequential SQL schema migrations
│   ├── src/controllers/      # API Logic (kbController, chatController, etc.)
│   ├── src/services/         # OpenAI / LangChain embedding services
│   └── server.js             # Main entry point
└── eductrl-chat-widget-new/  # Embeddable customer-facing chat widget
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `relation "document_chunks" does not exist` | Pending database migrations | Ensure you run `npm run migrate` in the backend folder to create the AI schema tables. |
| `extension "vector" is not available` | Running standard local PostgreSQL | Install the `pgvector` extension, or switch to using the `ankane/pgvector` Docker image. |
| Uploading a PDF results in `0 chunks` or a `Connection error` | IPv6 DNS hanging when connecting to OpenAI | Add `require('dns').setDefaultResultOrder('ipv4first');` to the very top of `backend/server.js`, or run node with `--dns-result-order=ipv4first`. |
