# KnowBridge Chat Support System

KnowBridge is a comprehensive, enterprise-grade multi-tenant AI Chat Support system. It enables SaaS providers, agencies, and enterprises to embed smart, AI-powered chat widgets across multiple isolated client websites, while managing all conversations, vector-based knowledge bases, and user data from a central backend.

---

## 🏗️ System Architecture

The project is split into three main components, all designed with strict **Tenant Isolation**:

1. **`backend/` (Node.js, Express, Socket.IO, PostgreSQL + pgvector)**
   The core API that handles multi-tenant authentication, realtime WebSockets, vector knowledge base searches via OpenAI (`text-embedding-3-small`), and data storage. It strictly validates incoming widget requests by matching the HTTP `Origin` against the tenant's registered domain to prevent data leaks.

2. **`admin-dashboard/` (React, Vite, Tailwind CSS)**
   The control panel for tenant admins. Admins can log in, view live chat conversations in real-time, configure their AI knowledge base (uploading PDFs/Docs to create vector embeddings), and generate the embed code for their widget.

3. **`KnowBridge-chat-widget/` (React, Webpack)**
   A lightweight, embeddable React application bundled into a single JS file. It gets injected into client websites and connects to the backend via WebSockets to provide end-users with AI-driven or human-driven customer support.

---

## 🛠️ Prerequisites & Installation

Before you start, ensure you have the following installed on your machine:
*   **Node.js** (v18 or higher)
*   **PostgreSQL** (v15 or higher) with the **`pgvector`** extension installed. (Crucial for AI knowledge base similarity search).
*   **Redis** (Optional but recommended for session/caching).
*   **OpenAI API Key** (Required for the AI chat responses and embedding generation).

*(Note: You can easily run PostgreSQL with pgvector and Redis using the provided `docker-compose.yml` file)*

### 1. Install All Dependencies (One-Click)
Because this is a monorepo with three separate projects, you can install everything at once from the root directory using the root `package.json`:
```bash
npm run install:all
```
*(This will automatically install dependencies for the backend, admin-dashboard, and chat-widget).*

### 2. Optional: Run Database via Docker
If you don't want to install PostgreSQL locally, you can use the included Docker configuration to spin up a PostgreSQL instance (pre-loaded with the `pgvector` extension) and a Redis instance:
```bash
docker-compose up -d
```

---

## ⚙️ 1. Backend Setup & Configuration

### Step 1: Database Setup
1. Open your local PostgreSQL instance (or the Docker container via pgAdmin/psql) and create a new database.
2. Ensure the `pgvector` extension is enabled on this database (required for vector embeddings):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. The backend uses raw SQL migrations located in `backend/database/migrations/`. You must run these files against your database to create the required tables (`tenants`, `agents`, `conversations`, `messages`, `document_chunks`).

### Step 2: Environment Variables
1. Copy the example `.env` file:
   ```bash
   cd backend
   cp .env.example .env
   ```
2. Open `backend/.env` and fill in the required variables:
   *   `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`: Your PostgreSQL credentials.
   *   `JWT_SECRET`: A secure, random 32+ character string.
   *   `OPENAI_API_KEY`: Your OpenAI API key starting with `sk-...`.
   *   `CORS_ORIGIN`: A comma-separated list of allowed domains (e.g., `http://localhost:3000,http://localhost:8000`).

### Step 3: Run the Backend
You can test the database connection using the provided test script:
```bash
node database/test_db.js
```
If successful, start the backend development server:
```bash
npm run dev
# OR from the root directory: npm run dev:backend
```
*The backend will run on `http://localhost:5000`.*

---

## 🖥️ 2. Admin Dashboard Setup

### Step 1: Environment Variables
1. Navigate to the admin dashboard and copy the `.env` file:
   ```bash
   cd admin-dashboard
   cp .env.example .env
   ```
2. Verify that `VITE_API_URL` and `VITE_SOCKET_URL` point to your backend (default is `http://localhost:5000`).

### Step 2: Run the Dashboard
Because this is a multi-tenant system, you might want to run multiple instances of the dashboard to test different tenant accounts.

To start a single instance on port 8000:
```bash
npm run dev -- --port=8000
# OR from the root directory: npm run dev:admin
```
*The Admin Dashboard will run on `http://localhost:8000`.*

*(Note: The Admin Dashboard dynamically relies on the backend `localhost:5000` for authentication and WebSocket connections. Ensure the backend is running).*

---

## 💬 3. Chat Widget Setup

### Step 1: Build the Widget Bundle
The chat widget must be bundled into a single JavaScript file so it can be embedded into client websites.
```bash
cd KnowBridge-chat-widget
npm run build:bundle
```
This command will use Webpack to generate `chat-widget.bundle.js` inside the `dist/` directory.

### Step 2: Serve the Widget
For development and testing, copy the generated `chat-widget.bundle.js` into the `backend/public/` folder. The backend is configured to statically serve this file at:
`http://localhost:5000/widget/chat-widget.bundle.js`

---

## 🏢 4. Multi-Tenant Flow & Creating a Tenant

Because KnowBridge is a multi-tenant SaaS platform, every client company (Tenant) must have a unique `Tenant ID`. This ID is the "glue" that connects the Chat Widget on the client's website to their specific Admin Dashboard.

### How the Flow Works:
1. **The Widget:** The Chat Widget is embedded on the client's website and configured with their specific `Tenant ID`.
2. **The Request:** When an end-user sends a message, the widget sends the `Tenant ID` and the browser's `Origin` URL to the backend.
3. **The Validation:** The backend intercepts this request, checks the PostgreSQL database, and verifies that the `Origin` URL exactly matches the domain registered to that `Tenant ID`.
4. **The Routing:** Once validated, the message is saved to that tenant's database partition and broadcasted via WebSockets **only** to Admin Dashboards currently logged in under that same `Tenant ID`.
5. **The AI:** If the user asks an AI question, the backend uses the `Tenant ID` to strictly filter the `pgvector` database, ensuring the AI only generates answers using that specific company's PDF documents.

### How to Create a New Tenant:
To manually create a new tenant for testing:

1. Open your PostgreSQL database.
2. Insert a new company into the `tenants` table (a UUID will be generated automatically, or you can supply one):
   ```sql
   INSERT INTO tenants (id, name, domain, status) 
   VALUES (gen_random_uuid(), 'My Test Company', 'localhost', 'active') 
   RETURNING id;
   ```
   *(Note down the returned `id` — this is your `Tenant ID`!)*
3. Create an admin account linked to this new tenant:
   ```sql
   INSERT INTO agents (id, tenant_id, name, email, password_hash, role, status) 
   VALUES (gen_random_uuid(), 'YOUR_TENANT_ID_HERE', 'Admin Name', 'admin@test.com', 'bcrypt_hash_here', 'admin', 'active');
   ```

---

## 🚀 5. End-to-End Testing (How to Embed)

To test the entire flow, embed the widget into a frontend project (HTML, React, Next.js, etc.).

1. Use the `Tenant ID` you generated in the steps above.
2. In your client website's HTML `<body>`, add the following snippet:

```html
<!-- KnowBridge Chat Widget Embed -->
<div id="KnowBridge-chat-root"></div>
<script>
  window.CHAT_CONFIG = {
    tenantId: "YOUR_TENANT_UUID_HERE",
    apiUrl: "http://localhost:5000",
    theme: "blue" // options: blue, green, purple, etc.
  };
  
  window.addEventListener('load', () => {
    if (window.KnowBridgeChat) window.KnowBridgeChat.init();
  });
</script>
<script src="http://localhost:5000/widget/chat-widget.bundle.js" async></script>
```

4. Open the client website in your browser.
5. Open the Admin Dashboard (`http://localhost:8000`) and log in.
6. Type a message in the client website widget. It will instantly appear in the Admin Dashboard via WebSockets.

---

## 🔒 Security Notes for Production
*   **Origin Validation:** The backend uses `validateTenantOrigin` middleware. It ensures that requests using a specific `tenantId` originate strictly from the domain registered to that tenant in the database.
*   **No Secrets in Widget:** The Chat Widget (`CHAT_CONFIG`) requires only the public `tenantId`. Never inject API keys or JWTs into the client widget.
*   **Vector Isolation:** All AI knowledge base queries strictly filter by `tenant_id` at the database level (`pgvector`) to prevent cross-tenant data contamination.
