const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from current directory

// Initialize Database
const db = new sqlite3.Database('./foodbridge.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        createTables();
    }
});

// Create tables if they don't exist
function createTables() {
    db.serialize(() => {
        // Contacts table
        db.run(`CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Pickup requests table
        db.run(`CREATE TABLE IF NOT EXISTS pickup_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            address TEXT NOT NULL,
            status TEXT DEFAULT 'Pending' NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Donations table
        db.run(`CREATE TABLE IF NOT EXISTS donations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            food_type TEXT NOT NULL,
            food_condition TEXT,
            quantity INTEGER NOT NULL,
            pickup_time TEXT,
            address TEXT NOT NULL,
            status TEXT DEFAULT 'Pending' NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Volunteers table
        db.run(`CREATE TABLE IF NOT EXISTS volunteers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT NOT NULL,
            area TEXT NOT NULL,
            availability TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Newsletters table
        db.run(`CREATE TABLE IF NOT EXISTS newsletters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
}

// Routes

// 1. Contact Form Handler
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const stmt = db.prepare('INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)');
    stmt.run([name, email, message], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Message sent successfully!' });
    });
    stmt.finalize();
});

// 2. Quick Pickup Request Handler
app.post('/api/pickup', (req, res) => {
    const { name, phone, address } = req.body;
    if (!name || !phone || !address) {
        return res.status(400).json({ error: 'Name, phone, and address are required.' });
    }

    const stmt = db.prepare('INSERT INTO pickup_requests (name, phone, address) VALUES (?, ?, ?)');
    stmt.run([name, phone, address], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Pickup request received!' });
    });
    stmt.finalize();
});

// 3. Donate Food Handler
app.post('/api/donate', (req, res) => {
    const { name, phone, food_type, food_condition, quantity, pickup_time, address } = req.body;
    if (!name || !phone || !food_type || !quantity || !address) {
        return res.status(400).json({ error: 'Missing required donation fields.' });
    }

    const stmt = db.prepare('INSERT INTO donations (name, phone, food_type, food_condition, quantity, pickup_time, address) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run([name, phone, food_type, food_condition || null, quantity, pickup_time || null, address], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Donation registered successfully!' });
    });
    stmt.finalize();
});

// 4. Volunteer Handler
app.post('/api/volunteer', (req, res) => {
    const { name, phone, email, area, availability } = req.body;
    if (!name || !phone || !email || !area) {
        return res.status(400).json({ error: 'Missing required volunteer fields.' });
    }

    const stmt = db.prepare('INSERT INTO volunteers (name, phone, email, area, availability) VALUES (?, ?, ?, ?, ?)');
    stmt.run([name, phone, email, area, availability || null], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Registered as volunteer!' });
    });
    stmt.finalize();
});

// 5. Newsletter Subscription Handler
app.post('/api/newsletter', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    const stmt = db.prepare('INSERT INTO newsletters (email) VALUES (?)');
    stmt.run([email], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Email already subscribed.' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'Subscribed successfully!' });
    });
    stmt.finalize();
});

// 6. Get Volunteer Tasks
app.get('/api/tasks', (req, res) => {
    const donationsQuery = `SELECT id, name, phone, food_type, food_condition, quantity, pickup_time, address, status, created_at, 'donation' as source FROM donations WHERE status = 'Pending'`;
    const pickupsQuery = `SELECT id, name, phone, 'Quick Request' as food_type, NULL as food_condition, NULL as quantity, NULL as pickup_time, address, status, created_at, 'quick_pickup' as source FROM pickup_requests WHERE status = 'Pending'`;

    db.all(`${donationsQuery} UNION ALL ${pickupsQuery} ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 7. Mark Task as Picked Up
app.post('/api/tasks/pickup', (req, res) => {
    const { id, source } = req.body;
    if (!id || !source) {
        return res.status(400).json({ error: 'Missing required fields: id, source.' });
    }

    let tableName;
    if (source === 'donation') tableName = 'donations';
    else if (source === 'quick_pickup') tableName = 'pickup_requests';
    else return res.status(400).json({ error: 'Invalid source.' });

    const stmt = db.prepare(`UPDATE ${tableName} SET status = 'Picked Up' WHERE id = ?`);
    stmt.run([id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found.' });
        res.json({ message: 'Task marked as Picked Up successfully!' });
    });
    stmt.finalize();
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
