# Uptime – Real-Time URL Monitoring Backend

Uptime is a **real-time URL monitoring backend** built using **Motia**.  
It continuously checks the health of registered URLs, streams live status updates, and sends email alerts on downtime or recovery.

---

## Features

- Monitor multiple URLs
- Periodic health checks (Active / Down)
- Logs HTTP status codes, latency, and timestamps
- Real-time updates using **Server-Sent Events (SSE)**
- **Email alerts** when a service goes down or comes back up
- Centralized, state-driven monitoring

---

## Tech Stack

- Node.js
- Motia
- Server-Sent Events (SSE)
- Email notification integration

---

## Project Structure
Uptime-Latency-Monitoring-Backend/ ├── api/ ├── flows/ ├── state/ ├── monitors/ └── package.json
Copy code

---

## Run Locally

```bash
cd Uptime-Latency-Monitoring-Backend/

npm i

npx motia dev

Open:
http://localhost:3000


API Overview:
Monitors API – Register URLs to monitor

Status API (SSE) – Stream live monitoring status

Email Alerts
Email notifications are a core feature.

Alerts are automatically sent when:
-A monitored service goes down
-A service recovers after downtime
Purpose

Built to explore real-time backend systems, monitoring architecture, SSE communication, and alerting mechanisms.