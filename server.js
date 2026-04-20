const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'super-secret-foodbridge-key-2026';

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

        // Add new columns to existing tables
        db.run("ALTER TABLE donations ADD COLUMN ngo_name TEXT", () => {});
        db.run("ALTER TABLE pickup_requests ADD COLUMN ngo_name TEXT", () => {});

        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            // Seed admins automatically upon restart
            const seedUsers = [
                { username: 'ameyabhagwat11', role: 'admin' },
                { username: 'ayushpund11', role: 'volunteer' },
                { username: 'verified_donor', role: 'user' }
            ];
            seedUsers.forEach(u => {
                db.get(`SELECT id FROM users WHERE username = ?`, [u.username], (err, row) => {
                    if (!err && !row) {
                        const hash = bcrypt.hashSync('FoodBidge', 10);
                        db.run(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`, [u.username, hash, u.role]);
                    } else if (row) {
                        db.run(`UPDATE users SET role = ? WHERE username = ?`, [u.role, u.username]);
                    }
                });
            });

            // Seed mock donations for the verified donor so they have 5 donations
            db.get(`SELECT COUNT(*) as count FROM donations WHERE phone = '9999999999'`, (err, row) => {
                if (row && row.count < 5) {
                    for(let i=0; i<5; i++) {
                        db.run(`INSERT INTO donations (name, phone, food_type, food_condition, quantity, pickup_time, address, status) VALUES ('Verified Donor', '9999999999', 'Cooked Meals', 'Fresh', 5, '14:00', 'Dummy Address', 'Verified')`);
                    }
                }
            });
        });
    });
}

// Middleware: Authenticate Admin Access
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Access denied. No token provided.' });
    
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. Invalid token.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Access forbidden. Admins only.' });
        }
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(400).json({ error: 'Invalid token.' });
    }
}

// Middleware: Authenticate Volunteer or Admin Access
function authenticateVolunteerOrAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Access denied. No token provided.' });
    
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. Invalid token.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin' && decoded.role !== 'volunteer') {
            return res.status(403).json({ error: 'Access forbidden. Volunteers or Admins only.' });
        }
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(400).json({ error: 'Invalid token.' });
    }
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

// --- AUTHENTICATION ROUTES ---

// Signup Route
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    try {
        const hash = bcrypt.hashSync(password, 10);
        db.run(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')`, [username, hash], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists.' });
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'User registered successfully!' });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'Invalid username or password.' });

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid username or password.' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ message: 'Logged in successfully', token, role: user.role });
    });
});


// 6. Get Volunteer Tasks (Volunteer and Admin ONLY)
app.get('/api/tasks', authenticateVolunteerOrAdmin, (req, res) => {
    // Check if phone has >= 5 donations in donations table
    const donationsQuery = `SELECT id, name, phone, food_type, food_condition, quantity, pickup_time, address, status, ngo_name, created_at, 'donation' as source, (SELECT COUNT(*) FROM donations d2 WHERE d2.phone = donations.phone) >= 5 as is_verified_donor FROM donations`;
    const pickupsQuery = `SELECT id, name, phone, 'Quick Request' as food_type, NULL as food_condition, NULL as quantity, NULL as pickup_time, address, status, ngo_name, created_at, 'quick_pickup' as source, (SELECT COUNT(*) FROM donations d2 WHERE d2.phone = pickup_requests.phone) >= 5 as is_verified_donor FROM pickup_requests`;

    // Order by 'Verified' at the bottom, then by created_at DESC
    db.all(`${donationsQuery} UNION ALL ${pickupsQuery} ORDER BY status = 'Verified' ASC, created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 7. Mark Task as Picked Up (Volunteer and Admin ONLY)
app.post('/api/tasks/pickup', authenticateVolunteerOrAdmin, (req, res) => {
    const { id, source } = req.body;
    if (!id || !source) {
        return res.status(400).json({ error: 'Missing required fields: id, source.' });
    }

    let tableName;
    if (source === 'donation') tableName = 'donations';
    else if (source === 'quick_pickup') tableName = 'pickup_requests';
    else return res.status(400).json({ error: 'Invalid source.' });

    const stmt = db.prepare(`UPDATE ${tableName} SET status = 'Picked Up' WHERE id = ? AND status = 'Pending'`);
    stmt.run([id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found or already picked up.' });
        res.json({ message: 'Task marked as Picked Up successfully!' });
    });
    stmt.finalize();
});

// 8. Mark Task as Donated (Volunteer and Admin ONLY)
app.post('/api/tasks/donate', authenticateVolunteerOrAdmin, (req, res) => {
    const { id, source, ngo_name } = req.body;
    if (!id || !source || !ngo_name) {
        return res.status(400).json({ error: 'Missing required fields: id, source, ngo_name.' });
    }

    let tableName;
    if (source === 'donation') tableName = 'donations';
    else if (source === 'quick_pickup') tableName = 'pickup_requests';
    else return res.status(400).json({ error: 'Invalid source.' });

    const stmt = db.prepare(`UPDATE ${tableName} SET status = 'Donated', ngo_name = ? WHERE id = ? AND status = 'Picked Up'`);
    stmt.run([ngo_name, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found or not in Picked Up state.' });
        res.json({ message: 'Task marked as Donated successfully!' });
    });
    stmt.finalize();
});

// 9. Verify Donation (ADMIN ONLY)
app.post('/api/tasks/verify', authenticateAdmin, (req, res) => {
    const { id, source } = req.body;
    if (!id || !source) {
        return res.status(400).json({ error: 'Missing required fields: id, source.' });
    }

    let tableName;
    if (source === 'donation') tableName = 'donations';
    else if (source === 'quick_pickup') tableName = 'pickup_requests';
    else return res.status(400).json({ error: 'Invalid source.' });

    db.run(`UPDATE ${tableName} SET status = 'Verified' WHERE id = ? AND status = 'Donated'`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found or not in Donated state.' });
        
        // Find donor details to send notification
        db.get(`SELECT name, phone, ngo_name FROM ${tableName} WHERE id = ?`, [id], (err, row) => {
            if (row) {
                console.log(`\n================================`);
                console.log(`[SMS NOTIFICATION SENT] To ${row.name} (${row.phone}): `);
                console.log(`"Your food has been verified and donated at '${row.ngo_name}'! Thank you for your contribution."`);
                console.log(`================================\n`);
            }
            res.json({ message: 'Donation verified and donor notified successfully!' });
        });
    });
});

// 10. Get All Accounts (ADMIN ONLY)
app.get('/api/accounts', authenticateAdmin, (req, res) => {
    db.all(`SELECT id, username, role, created_at FROM users ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 11. Change User Role (ADMIN ONLY)
app.post('/api/accounts/role', authenticateAdmin, (req, res) => {
    const { id, role } = req.body;
    if (!id || !role) return res.status(400).json({ error: 'Missing id or role' });
    if (!['user', 'volunteer', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Role updated successfully!' });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
