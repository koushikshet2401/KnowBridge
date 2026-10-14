# Chaty

Chaty is a multi-tenant AI support chat platform. A business signs up, adds its help content to a knowledge base, and embeds a chat widget on its website. Visitors get answers generated from that business's own documents, and support agents take over live chats from an admin dashboard when the AI can't help.

---

## Project layout

| Folder | Stack | What it is |
|---|---|---|
| `backend/` | Node.js, Express, Socket.IO, PostgreSQL + pgvector | API, auth, real-time chat, knowledge-base search (RAG) |
| `admin-dashboard/` | React, Vite, Tailwind CSS | Control panel for each tenant: chats, knowledge base, team, settings |
| `chat-widget/` | React, Webpack | The embeddable widget, built into a single `chat-widget.bundle.js` |
| `demo-site/` | Plain HTML + tiny Node server | Local test website that embeds the widget |
| `landing-page/` | HTML | Marketing/demo page with the widget |
| `Architecture Diagram/` | HTML | Diagrams of the runtime, data pipeline and request flow |

### How a chat works

1. A tenant signs up in the dashboard and registers the **website domain** where the widget will run.
2. The widget is embedded on that site with the tenant's public `tenantId`.
3. The backend only accepts widget traffic whose browser `Origin` matches the tenant's domain (`localhost` is also allowed while `NODE_ENV` is not `production`).
4. Each visitor message is answered from the tenant's own knowledge base: the question is embedded with OpenAI `text-embedding-3-small`, the closest chunks are found with pgvector (always filtered by `tenant_id`), and the model answers only from them.
5. If the visitor asks for a human, the chat is handed to the tenant's agents, who see it live in the dashboard.

---

## Prerequisites

- **Node.js 22 LTS** (or 18+)
- **PostgreSQL 15+ with the `pgvector` extension**: either [Supabase](https://supabase.com) (free tier works; pgvector is built in) or the included `docker-compose.yml`
- **OpenAI API key** for AI answers and document embeddings

Install everything from the repo root:

```bash
npm run install:all
```

---

## 1. Database

Apply the migrations in `backend/database/migrations/` in order:

- `001_initial_schema.sql`: tenants, users, agents, chats, messages, documents, document chunks, settings, crawl jobs
- `002_restore_columns_used_by_code.sql`: feedback and notifications tables, extra columns, and the HNSW vector index

Either run `npm run migrate` from `backend/` once `.env` is set up, or paste both files into the Supabase SQL editor.

**Supabase only:** enable Row Level Security on every table in the `public` schema (no policies needed). The backend connects as the `postgres` role, which bypasses RLS, while Supabase's public Data API is then blocked from reading your data.

## 2. Backend

Create `backend/.env`:

```bash
NODE_ENV=development
PORT=5000

# Supabase: Dashboard → Connect → Session pooler
DB_HOST=aws-0-<region>.pooler.supabase.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.<project-ref>
DB_PASSWORD=<database password>
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
DB_POOL_MAX=10

OPENAI_API_KEY=<your OpenAI key>

# Any two long random strings
JWT_SECRET=<random string>
CHAT_AUTH_SECRET=<random string>

# Browser origins allowed to call the API (dashboard, test site)
CORS_ORIGIN=http://localhost:8000,http://localhost:3000
SOCKET_IO_CORS_ORIGIN=http://localhost:8000,http://localhost:3000

REDIS_ENABLED=false
```

Use the Supabase **session pooler**, not the direct connection; the direct host is IPv6-only.

Start it:

```bash
npm run dev:backend
```

The API runs on `http://localhost:5000`, and `GET /health` reports database status.

## 3. Admin dashboard

Create `admin-dashboard/.env`:

```bash
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

```bash
npm run dev:admin
```

Open `http://localhost:8000`, choose **Create an account**, and enter your company, website domain, name, email and password. This creates your tenant and its first admin. The domain can be changed later in **Settings → Website**.

## 4. Chat widget

Build the bundle and copy it to where the backend serves it:

```bash
cd chat-widget
npm run build:bundle
cp dist/chat-widget.bundle.js ../backend/public/
```

The backend serves it at `http://localhost:5000/widget/chat-widget.bundle.js`.

## 5. Try it on the local test site

```bash
npm run dev:demo
```

Open `http://localhost:3000`, paste your Tenant ID (from **Settings → Widget Embed** in the dashboard) and click **Load chat widget**. Messages sent from the widget appear live in the dashboard's **Chats** page.

### Embedding on a real website

Copy the snippet from **Settings → Widget Embed**:

```html
<script>
  window.ChatyConfig = {
    tenantId: "YOUR_TENANT_ID",
    apiUrl: "https://your-backend.example.com"
  };
</script>
<script src="https://your-backend.example.com/widget/chat-widget.bundle.js" async></script>
```

The site's domain must match the one registered in **Settings → Website**.

---

## Security notes

- **Tenant isolation:** every query is filtered by `tenant_id`, and both visitors and agents can only join chat rooms that belong to their own tenant.
- **Origin check:** widget requests and sockets must come from the tenant's registered domain. The `localhost` exception is disabled when `NODE_ENV=production`.
- **No secrets in the widget:** `ChatyConfig` only contains the public `tenantId` and API URL.
- **Dashboard auth:** JWTs issued by `/api/auth/login` and `/api/auth/signup`. The tenant always comes from the agent's database record, never from the client.

## Not yet implemented

These admin endpoints return `501 Not Implemented`: reviews, feedback analysis, agent edit/delete/stats, "my chats" and date-range stats.
