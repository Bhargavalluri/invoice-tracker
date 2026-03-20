# Invoice & Payment Tracker

A full-stack web application for managing invoices, tracking payments, and monitoring business finances — built with Python, SQLite, and plain HTML/CSS/JavaScript.

---

## Features

- **Dashboard** — at-a-glance summary of total invoiced, collected, pending, and overdue amounts
- **Invoice Management** — create, edit, and delete invoices with client assignment, descriptions, amounts, due dates, and status
- **Payment Recording** — log partial or full payments against any invoice; automatically marks invoices as Paid when fully settled
- **Client Management** — maintain a client list with name, company, and email
- **Status Filtering** — filter invoices by All / Pending / Paid / Overdue
- **Search** — search invoices by invoice number, client name, or description
- **Payment History** — view all payment entries for any individual invoice

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, Flask |
| Database | SQLite (via Python's built-in `sqlite3` module) |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Styling | Custom CSS (no frameworks) |

---

## Project Structure

```
invoice-tracker/
├── app.py                  # Flask server, API routes, SQLite setup
├── requirements.txt        # Python dependencies
├── invoices.db             # SQLite database (auto-created on first run)
├── templates/
│   └── index.html          # Single-page HTML application
└── static/
    ├── style.css           # All CSS styles
    └── app.js              # Frontend JavaScript (API calls, UI logic)
```

---

## Database Schema

Three tables managed via raw SQL:

**`clients`**
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL,
email TEXT,
company TEXT,
created_at TEXT
```

**`invoices`**
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
client_id INTEGER,
invoice_number TEXT UNIQUE,
description TEXT,
amount REAL,
status TEXT,   -- 'pending' | 'paid' | 'overdue'
due_date TEXT,
created_at TEXT
```

**`payments`**
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
invoice_id INTEGER,
amount_paid REAL,
payment_date TEXT,
notes TEXT,
created_at TEXT
```

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/` | Serves the main HTML page |
| GET | `/summary` | Revenue totals for the dashboard |
| GET | `/clients` | List all clients |
| POST | `/clients` | Create a new client |
| GET | `/invoices` | List invoices (optional `?status=` filter) |
| POST | `/invoices` | Create a new invoice |
| PUT | `/invoices/<id>` | Update an invoice |
| DELETE | `/invoices/<id>` | Delete invoice and its payment history |
| GET | `/payments/<invoice_id>` | Get payment history for an invoice |
| POST | `/payments` | Record a payment |

---

## Running Locally

1. **Install dependencies**
   ```bash
   pip install flask
   ```

2. **Run the server**
   ```bash
   python app.py
   ```

3. **Open in browser**
   ```
   http://localhost:20440
   ```

The SQLite database (`invoices.db`) is created automatically on first run and seeded with sample clients, invoices, and payments so you can explore the app immediately.

---

## AI Assistance

This project was built with the assistance of an AI coding assistant (chatgpt) for:

- Scaffolding the Flask application structure and REST API routes
- Writing the SQLite schema and seed data
- Generating the HTML layout and CSS design system
- Debugging a routing conflict where `/api/*` paths were intercepted by another service, and resolving it by removing the `/api` prefix from all Flask routes

The core logic, database design decisions, and feature requirements were defined to align with real-world accounting workflows (similar to tools like QuickBooks), demonstrating understanding of invoice lifecycle management, partial payment tracking, and financial reporting.
