import os
import json
import sqlite3
from datetime import datetime, date
from flask import Flask, request, jsonify, send_from_directory, render_template

app = Flask(__name__, static_folder="static", template_folder="templates")

DB_PATH = os.path.join(os.path.dirname(__file__), "invoices.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            company TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            invoice_number TEXT NOT NULL UNIQUE,
            description TEXT,
            amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            due_date TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (client_id) REFERENCES clients(id)
        );

        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            amount_paid REAL NOT NULL,
            payment_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        );
    """)

    c.execute("SELECT COUNT(*) FROM clients")
    if c.fetchone()[0] == 0:
        c.executescript("""
            INSERT INTO clients (name, email, company) VALUES
                ('Alice Johnson', 'alice@acme.com', 'Acme Corp'),
                ('Bob Smith', 'bob@globex.com', 'Globex Inc'),
                ('Carol White', 'carol@initech.com', 'Initech LLC');

            INSERT INTO invoices (client_id, invoice_number, description, amount, status, due_date) VALUES
                (1, 'INV-001', 'Website Redesign', 3500.00, 'paid', '2026-02-28'),
                (1, 'INV-002', 'SEO Optimization', 1200.00, 'pending', '2026-03-30'),
                (2, 'INV-003', 'Mobile App Development', 8000.00, 'pending', '2026-04-15'),
                (2, 'INV-004', 'API Integration', 2500.00, 'overdue', '2026-02-10'),
                (3, 'INV-005', 'Cloud Migration', 5000.00, 'paid', '2026-03-01');

            INSERT INTO payments (invoice_id, amount_paid, payment_date, notes) VALUES
                (1, 3500.00, '2026-02-25', 'Full payment received'),
                (5, 5000.00, '2026-02-28', 'Wire transfer');
        """)

    conn.commit()
    conn.close()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/clients", methods=["GET"])
def get_clients():
    conn = get_db()
    clients = conn.execute("SELECT * FROM clients ORDER BY name").fetchall()
    conn.close()
    return jsonify([dict(c) for c in clients])


@app.route("/clients", methods=["POST"])
def create_client():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Name is required"}), 400
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO clients (name, email, company) VALUES (?, ?, ?)",
        (data["name"], data.get("email", ""), data.get("company", ""))
    )
    conn.commit()
    client_id = c.lastrowid
    client = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    conn.close()
    return jsonify(dict(client)), 201


@app.route("/invoices", methods=["GET"])
def get_invoices():
    status_filter = request.args.get("status")
    conn = get_db()
    if status_filter and status_filter != "all":
        invoices = conn.execute("""
            SELECT i.*, c.name as client_name, c.company as client_company,
                   COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id), 0) as amount_paid
            FROM invoices i
            JOIN clients c ON i.client_id = c.id
            WHERE i.status = ?
            ORDER BY i.created_at DESC
        """, (status_filter,)).fetchall()
    else:
        invoices = conn.execute("""
            SELECT i.*, c.name as client_name, c.company as client_company,
                   COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id), 0) as amount_paid
            FROM invoices i
            JOIN clients c ON i.client_id = c.id
            ORDER BY i.created_at DESC
        """).fetchall()
    conn.close()
    return jsonify([dict(inv) for inv in invoices])


@app.route("/invoices", methods=["POST"])
def create_invoice():
    data = request.get_json()
    required = ["client_id", "invoice_number", "amount", "due_date"]
    for field in required:
        if not data or field not in data:
            return jsonify({"error": f"{field} is required"}), 400
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute(
            """INSERT INTO invoices (client_id, invoice_number, description, amount, status, due_date)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                data["client_id"],
                data["invoice_number"],
                data.get("description", ""),
                float(data["amount"]),
                data.get("status", "pending"),
                data["due_date"]
            )
        )
        conn.commit()
        invoice_id = c.lastrowid
        invoice = conn.execute("""
            SELECT i.*, c.name as client_name, c.company as client_company, 0 as amount_paid
            FROM invoices i JOIN clients c ON i.client_id = c.id
            WHERE i.id = ?
        """, (invoice_id,)).fetchone()
        conn.close()
        return jsonify(dict(invoice)), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Invoice number already exists"}), 409


@app.route("/invoices/<int:invoice_id>", methods=["PUT"])
def update_invoice(invoice_id):
    data = request.get_json()
    conn = get_db()
    existing = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Invoice not found"}), 404
    fields = []
    values = []
    for field in ["client_id", "description", "amount", "status", "due_date"]:
        if field in data:
            fields.append(f"{field} = ?")
            values.append(data[field])
    if fields:
        values.append(invoice_id)
        conn.execute(f"UPDATE invoices SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    invoice = conn.execute("""
        SELECT i.*, c.name as client_name, c.company as client_company,
               COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.invoice_id = i.id), 0) as amount_paid
        FROM invoices i JOIN clients c ON i.client_id = c.id
        WHERE i.id = ?
    """, (invoice_id,)).fetchone()
    conn.close()
    return jsonify(dict(invoice))


@app.route("/invoices/<int:invoice_id>", methods=["DELETE"])
def delete_invoice(invoice_id):
    conn = get_db()
    existing = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Invoice not found"}), 404
    conn.execute("DELETE FROM payments WHERE invoice_id = ?", (invoice_id,))
    conn.execute("DELETE FROM invoices WHERE id = ?", (invoice_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Invoice deleted"})


@app.route("/payments", methods=["POST"])
def record_payment():
    data = request.get_json()
    if not data or not data.get("invoice_id") or not data.get("amount_paid"):
        return jsonify({"error": "invoice_id and amount_paid are required"}), 400
    conn = get_db()
    invoice = conn.execute("SELECT * FROM invoices WHERE id = ?", (data["invoice_id"],)).fetchone()
    if not invoice:
        conn.close()
        return jsonify({"error": "Invoice not found"}), 404
    c = conn.cursor()
    c.execute(
        "INSERT INTO payments (invoice_id, amount_paid, payment_date, notes) VALUES (?, ?, ?, ?)",
        (
            data["invoice_id"],
            float(data["amount_paid"]),
            data.get("payment_date", datetime.now().strftime("%Y-%m-%d")),
            data.get("notes", "")
        )
    )
    total_paid = conn.execute(
        "SELECT COALESCE(SUM(amount_paid), 0) FROM payments WHERE invoice_id = ?",
        (data["invoice_id"],)
    ).fetchone()[0]
    if total_paid >= invoice["amount"]:
        conn.execute("UPDATE invoices SET status = 'paid' WHERE id = ?", (data["invoice_id"],))
    conn.commit()
    conn.close()
    return jsonify({"message": "Payment recorded", "total_paid": total_paid}), 201


@app.route("/payments/<int:invoice_id>", methods=["GET"])
def get_payments(invoice_id):
    conn = get_db()
    payments = conn.execute(
        "SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC",
        (invoice_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(p) for p in payments])


@app.route("/summary", methods=["GET"])
def get_summary():
    conn = get_db()
    total_invoiced = conn.execute("SELECT COALESCE(SUM(amount), 0) FROM invoices").fetchone()[0]
    total_paid = conn.execute("SELECT COALESCE(SUM(amount_paid), 0) FROM payments").fetchone()[0]
    total_pending = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE status = 'pending'"
    ).fetchone()[0]
    total_overdue = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE status = 'overdue'"
    ).fetchone()[0]
    count_by_status = conn.execute(
        "SELECT status, COUNT(*) as count FROM invoices GROUP BY status"
    ).fetchall()
    conn.close()
    return jsonify({
        "total_invoiced": total_invoiced,
        "total_paid": total_paid,
        "total_pending": total_pending,
        "total_overdue": total_overdue,
        "count_by_status": {row["status"]: row["count"] for row in count_by_status}
    })


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 20440))
    app.run(host="0.0.0.0", port=port, debug=False)
