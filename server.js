
const express = require('express');
const { getDatabase, saveDatabase } = require('./database');
const { exec } = require('child_process');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const libxmljs = require('libxmljs2');
const cookieParser = require('cookie-parser');
const vm = require('vm');
const https = require('https');

const app = express();
const port = 3000;

// Security Misconfiguration: Disable security headers
// app.disable('x-powered-by'); // This would be a good thing to do, but we are leaving it for demonstration

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
// VULNERABLE: Enabling directory listing by serving from the root
app.use(express.static('.'));
// app.use(express.static('public')); // This would be the secure way

// Secret Exposure: Hardcoded API Key
const GOOGLE_API_KEY = "AIzaSyD-unv-8848-x-0-80-00-x-0";
const AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

let db;

(async () => {
    db = await getDatabase();
})();

app.get('/', (req, res) => {
    res.render('index');
});

// SQL Injection Vulnerability in login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    console.log('Executing query:', query);
    try {
        const user = db.exec(query);
        if (user.length > 0) {
            res.redirect('/profile/' + user[0].values[0][0]);
        } else {
            res.send('Login failed');
        }
    } catch (error) {
        res.send('An error occurred: ' + error.message);
    }
});

// Insecure Direct Object Reference (IDOR)
app.get('/profile/:id', (req, res) => {
    const { id } = req.params;
    const user = db.exec(`SELECT * FROM users WHERE id = ${id}`);
    if (user.length > 0) {
        res.render('profile', { user: user[0].values[0] });
    } else {
        res.send('User not found');
    }
});

app.get('/search', (req, res) => {
    res.render('search', { results: [] });
});

// SQL Injection and XSS Vulnerability in search
app.post('/search', (req, res) => {
    const { query } = req.body;
    const sqlQuery = `SELECT * FROM users WHERE username LIKE '%${query}%'`;
    console.log('Executing query:', sqlQuery);
    try {
        const results = db.exec(sqlQuery);
        res.render('search', { results: results.length > 0 ? results[0].values : [], query });
    } catch (error) {
        res.render('search', { results: [], error: error.message, query });
    }
});

app.get('/comments', (req, res) => {
    const comments = db.exec("SELECT * FROM comments");
    res.render('comments', { comments: comments.length > 0 ? comments[0].values : [] });
});

// Stored XSS Vulnerability in comments
app.post('/comment', (req, res) => {
    const { comment } = req.body;
    const stmt = db.prepare("INSERT INTO comments (content) VALUES (?)");
    stmt.run(comment);
    stmt.free();
    saveDatabase(db);
    res.redirect('/comments');
});

// Command Injection Vulnerability
app.get('/ping', (req, res) => {
    const { host } = req.query;
    // CRITICAL: User input is directly passed to shell command
    exec(`ping -c 1 ${host}`, (error, stdout, stderr) => {
        if (error) {
            res.send(`Error: ${error.message}`);
            return;
        }
        res.send(`<pre>${stdout}</pre>`);
    });
});

// Path Traversal Vulnerability
app.get('/read-file', (req, res) => {
    const { filename } = req.query;
    // CRITICAL: User input is used to read arbitrary files
    try {
        const data = fs.readFileSync(filename, 'utf8');
        res.send(`<pre>${data}</pre>`);
    } catch (error) {
        res.send(`Could not read file: ${error.message}`);
    }
});

// ReDoS (Regular Expression Denial of Service)
app.get('/check-pattern', (req, res) => {
    const { input } = req.query;
    // VULNERABLE: Nested quantifiers can lead to exponential time complexity
    const pattern = /^(a+)+$/;
    const isMatch = pattern.test(input);
    res.send(`Match result: ${isMatch}`);
});

// Insecure Deserialization using eval()
app.post('/parse-config', (req, res) => {
    const { config } = req.body;
    // CRITICAL: eval() on user input is extremely dangerous
    try {
        const parsed = eval("(" + config + ")");
        res.json({ status: "success", data: parsed });
    } catch (e) {
        res.status(400).send("Invalid config");
    }
});

// Weak JWT Secret
const JWT_SECRET = "secret"; // Hardcoded, weak secret
app.post('/login-jwt', (req, res) => {
    const { user } = req.body;
    const token = jwt.sign({ user }, JWT_SECRET);
    res.json({ token });
});

app.get('/verify-jwt', (req, res) => {
    const token = req.headers['authorization'];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ decoded });
    } catch (err) {
        res.status(401).send("Unauthorized");
    }
});

// Broken Access Control
app.get('/admin/delete-all', (req, res) => {
    // VULNERABLE: Simple query param check for admin access
    if (req.query.admin === 'true') {
        res.send("All data deleted (simulated)");
    } else {
        res.status(403).send("Forbidden: Admins only");
    }
});

// Insecure Cryptography: MD5 hashing
app.get('/generate-token', (req, res) => {
    const { email } = req.query;
    // VULNERABLE: MD5 is considered broken for security purposes
    const token = crypto.createHash('md5').update(email + Date.now()).digest('hex');
    res.send(`Reset token: ${token}`);
});

// Server-Side Request Forgery (SSRF)
app.get('/fetch-url', async (req, res) => {
    const { url } = req.query;
    // CRITICAL: User input is used to make internal/external requests
    try {
        const response = await axios.get(url);
        res.send(response.data);
    } catch (error) {
        res.status(500).send(`Error fetching URL: ${error.message}`);
    }
});

// Prototype Pollution
const merge = (target, source) => {
    for (let key in source) {
        if (key === '__proto__' || key === 'constructor') continue; // Simple guard, but easily bypassed in real scenarios if not recursive or complex enough
        if (typeof target[key] === 'object' && typeof source[key] === 'object') {
            merge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
};

// VULNERABLE: Insecure merge implementation
const insecureMerge = (target, source) => {
    for (let key in source) {
        target[key] = source[key]; // No protection against __proto__
    }
    return target;
};

app.post('/update-settings', (req, res) => {
    const settings = {};
    insecureMerge(settings, req.body);
    res.json({ status: "settings updated", settings });
});

// Open Redirect
app.get('/goto', (req, res) => {
    const { url } = req.query;
    // VULNERABLE: Unvalidated user input in redirect
    res.redirect(url);
});

// Sensitive Data Exposure
app.post('/payment', (req, res) => {
    const { cardNumber, cvv, amount } = req.body;
    // CRITICAL: Logging sensitive information to console
    console.log(`Processing payment for ${cardNumber} (CVV: ${cvv}) for amount: ${amount}`);
    res.json({ status: "payment processed" });
});

// Simulated NoSQL Injection
app.post('/users/find', (req, res) => {
    const { query } = req.body;
    // VULNERABLE: Direct use of object in a way that mimics NoSQL injection (e.g., passing {$ne: null})
    console.log("Simulating NoSQL query with:", JSON.stringify(query));
    res.json({ message: "Search processed", results: [] });
});

// XML External Entity (XXE)
app.post('/upload-xml', (req, res) => {
    const xmlData = req.body.xml;
    // CRITICAL: libxmljs with noent: true allows external entities
    try {
        const xmlDoc = libxmljs.parseXml(xmlData, { noent: true, dtdload: true, dtdattr: true });
        res.send(xmlDoc.toString());
    } catch (e) {
        res.status(400).send("Invalid XML: " + e.message);
    }
});

// Insecure Randomness
app.get('/generate-csrf-token', (req, res) => {
    // VULNERABLE: Math.random() is not cryptographically secure
    const token = Math.random().toString(36).substring(2);
    res.json({ token });
});

// Lack of CSRF Protection
app.post('/update-email', (req, res) => {
    const { email } = req.body;
    // VULNERABLE: Sensitive action with no CSRF token check
    console.log(`Updating user email to: ${email}`);
    res.json({ status: "success", email });
});

// HTTP Header Injection
app.get('/set-header', (req, res) => {
    const { name, value } = req.query;
    // VULNERABLE: Directly setting headers from user input can lead to splitting/injection
    res.set(name, value);
    res.send(`Header ${name} set to ${value}`);
});

// Insecure Cookies
app.get('/set-session', (req, res) => {
    // VULNERABLE: Missing HttpOnly and Secure flags
    res.cookie('sessionId', '123456789', { expires: new Date(Date.now() + 900000) });
    res.send("Session cookie set");
});

// Sandbox Escape (vulnerable vm module usage)
app.post('/run-code', (req, res) => {
    const { code } = req.body;
    // CRITICAL: vm.runInNewContext is not a robust sandbox
    try {
        const context = { result: null };
        vm.runInNewContext(code, context);
        res.json({ result: context.result });
    } catch (e) {
        res.status(400).send("Execution error: " + e.message);
    }
});

// Insecure TLS Validation
app.get('/fetch-insecure', async (req, res) => {
    const { url } = req.query;
    // CRITICAL: Explicitly disabling TLS certificate checks
    const agent = new https.Agent({
        rejectUnauthorized: false
    });
    try {
        const response = await axios.get(url, { httpsAgent: agent });
        res.send(response.data);
    } catch (error) {
        res.status(500).send(`Error fetching URL: ${error.message}`);
    }
});

// Mass Assignment
app.post('/update-user-profile', (req, res) => {
    const { userId } = req.body;
    const user = { id: userId, username: "user1", isAdmin: false };
    // VULNERABLE: Merging entire body allows overwriting sensitive fields like isAdmin
    Object.assign(user, req.body);
    res.json({ message: "User updated", user });
});

// Race Condition (Simulated)
let balance = 1000;
app.post('/transfer', (req, res) => {
    const { amount } = req.body;
    // VULNERABLE: Asynchronous delay between check and update
    if (balance >= amount) {
        setTimeout(() => {
            balance -= amount;
            res.json({ message: "Transfer successful", newBalance: balance });
        }, 100); // Simulate processing time
    } else {
        res.status(400).send("Insufficient funds");
    }
});

app.listen(port, () => {
    console.log(`Vulnerable app listening at http://localhost:${port}`);
});

process.on('exit', () => {
    if (db) {
        saveDatabase(db);
        console.log('Database saved.');
    }
});
// Test trigger for security scan
