
const express = require('express');
const ejs = require('ejs');
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
const multer = require('multer');
const path = require('path');
const yaml = require('js-yaml');
const AdmZip = require('adm-zip');
const serialize = require('node-serialize');

const app = express();
const port = 3000;

// Multer configuration for insecure file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        // VULNERABLE: Keeping original name and extension
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// VULNERABLE: No frame-protection headers (Clickjacking)
// res.header("X-Frame-Options", "DENY"); // Missing

// Security Misconfiguration: Disable security headers
// app.disable('x-powered-by'); // This would be a good thing to do, but we are leaving it for demonstration

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// VULNERABLE: Insecure CORS Configuration
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

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

// Server-Side Template Injection (SSTI)
app.get('/render', (req, res) => {
    const { template, name } = req.query;
    // CRITICAL: Rendering a template directly from user input
    try {
        const rendered = ejs.render(template || 'Hello <%= name %>', { name: name || 'Guest' });
        res.send(rendered);
    } catch (e) {
        res.status(400).send("Template Error: " + e.message);
    }
});

// HTTP Parameter Pollution (HPP)
app.get('/user-lookup', (req, res) => {
    const { id } = req.query;
    // VULNERABLE: If 'id' is an array (e.g., ?id=1&id=2), it might cause logic errors
    console.log("Looking up user with ID:", id);
    const user = db.exec(`SELECT * FROM users WHERE id = ${id}`);
    res.json({ user: user.length > 0 ? user[0].values : [] });
});

// Exposure of Sensitive System Information
app.get('/config', (req, res) => {
    // CRITICAL: Leaking internal configuration
    res.json({
        database: {
            path: './database.sqlite',
            type: 'sqlite3'
        },
        server: {
            port: port,
            env: process.env.NODE_ENV || 'development',
            admin_secret: 'super-secret-internal-key'
        }
    });
});

// Improper Error Handling: Leaking stack traces
app.get('/cause-error', (req, res) => {
    throw new Error("This is a forced error to test error handling");
});

app.use((err, req, res, next) => {
    // CRITICAL: Returning full stack trace and environment variables to the user
    console.error(err.stack);
    res.status(500).json({
        message: "Internal Server Error",
        error: err.message,
        stack: err.stack,
        environment: process.env
    });
});

// Insecure File Upload
app.post('/upload-profile-pic', upload.single('profilePic'), (req, res) => {
    // CRITICAL: No file type validation, allows .js, .php, etc.
    if (!req.file) {
        return res.status(400).send("No file uploaded");
    }
    res.json({ message: "File uploaded successfully", path: req.file.path });
});

// Session Fixation
const sessions = {};
app.post('/login-session-fixation', (req, res) => {
    const { username } = req.body;
    let sessionId = req.cookies.sessionId;

    // VULNERABLE: Not regenerating sessionId on login
    if (!sessionId) {
        sessionId = Math.random().toString(36).substring(2);
        res.cookie('sessionId', sessionId);
    }

    sessions[sessionId] = { username, authenticated: true };
    res.json({ message: "Logged in", sessionId });
});

// Denial of Service (Resource Exhaustion)
app.get('/allocate-memory', (req, res) => {
    const { size } = req.query;
    // CRITICAL: Allocating memory based on user input
    const bufferSize = parseInt(size) || 1024;
    try {
        const data = Buffer.alloc(bufferSize);
        res.send(`Allocated ${data.length} bytes of memory`);
    } catch (e) {
        res.status(500).send("Allocation failed: " + e.message);
    }
});

// Business Logic Flaw
app.post('/checkout', (req, res) => {
    const { items, total } = req.body;
    // VULNERABLE: Not validating if total is positive or matches items price
    if (total < 0) {
        console.log("Negative total accepted! System exploited?");
    }
    res.json({ message: "Order processed", total });
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

// --- ROUND 8 VULNERABILITIES ---

// Log Injection
app.get('/log-info', (req, res) => {
    const { message } = req.query;
    // VULNERABLE: User input is logged directly, allowing for log injection/forgery
    console.log(`[INFO] User activity: ${message}`);
    res.send("Activity logged");
});

// Insecure YAML Parsing
app.post('/parse-yaml', (req, res) => {
    const { yamlData } = req.body;
    // CRITICAL: yaml.load() (or the old JS-YAML version) is vulnerable to code execution
    try {
        const doc = yaml.load(yamlData); // In older versions this was very dangerous
        res.json({ status: "YAML parsed", data: doc });
    } catch (e) {
        res.status(400).send("Invalid YAML: " + e.message);
    }
});

// Zip Slip Vulnerability
app.post('/upload-zip', upload.single('zipFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send("No zip file uploaded");
    }

    const zip = new AdmZip(req.file.path);
    const zipEntries = zip.getEntries();

    // CRITICAL: No validation on entry names, allowing path traversal (Zip Slip)
    zipEntries.forEach(entry => {
        const entryName = entry.entryName;
        const targetPath = path.join('public/uploads/', entryName);
        console.log(`Extracting ${entryName} to ${targetPath}`);
        // In a real exploit, entryName could be '../../etc/passwd'
        fs.writeFileSync(targetPath, entry.getData());
    });

    res.json({ message: "Zip extracted (potentially insecurely)" });
});

// Clickjacking - Explicitly vulnerable headers
app.get('/frame-me', (req, res) => {
    // VULNERABLE: Explicitly allowing framing from anywhere
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.send("<html><body><h1>This page can be framed!</h1></body></html>");
});

// Insecure Deserialization (Variant 2)
app.post('/deserialize-node', (req, res) => {
    const { data } = req.body;
    // CRITICAL: node-serialize.unserialize is extremely dangerous
    try {
        const obj = serialize.unserialize(data);
        res.json({ status: "Data deserialized", result: obj });
    } catch (e) {
        res.status(400).send("Deserialization error: " + e.message);
    }
});

// --- ROUND 9 VULNERABILITIES ---

// Host Header Injection / Password Reset Poisoning
app.get('/password-reset-link', (req, res) => {
    const { user } = req.query;
    const token = crypto.randomBytes(8).toString('hex');
    // VULNERABLE: Trusting Host header when constructing reset URL
    const resetUrl = `${req.protocol}://${req.headers.host}/reset-password?user=${encodeURIComponent(user || '')}&token=${token}`;
    res.json({ resetUrl });
});

// JSONP Endpoint (XSS)
app.get('/jsonp', (req, res) => {
    const { callback } = req.query;
    const payload = { status: "ok", time: Date.now() };
    // VULNERABLE: Unvalidated callback allows arbitrary JS execution
    res.type('text/javascript');
    res.send(`${callback}(${JSON.stringify(payload)})`);
});

// Arbitrary File Deletion
app.post('/delete-file', (req, res) => {
    const { target } = req.body;
    // CRITICAL: User-controlled file path allows deleting arbitrary files
    try {
        fs.unlinkSync(target);
        res.send(`Deleted file: ${target}`);
    } catch (e) {
        res.status(500).send(`Delete failed: ${e.message}`);
    }
});

// Unsafe Dynamic Code Execution
app.post('/calculate', (req, res) => {
    const { expression } = req.body;
    // CRITICAL: new Function executes arbitrary code
    try {
        const fn = new Function(`return (${expression})`);
        const result = fn();
        res.json({ result });
    } catch (e) {
        res.status(400).send("Invalid expression: " + e.message);
    }
});

// --- ROUND 10 VULNERABILITIES ---

// JWT Alg None / Signature Bypass
app.post('/jwt-none', (req, res) => {
    const { token } = req.body;
    // CRITICAL: Decoding token without verifying signature
    try {
        const decoded = jwt.decode(token);
        res.json({ decoded });
    } catch (e) {
        res.status(400).send("Invalid token: " + e.message);
    }
});

// SQL Injection (Orders)
app.get('/orders', (req, res) => {
    const { id } = req.query;
    // VULNERABLE: Direct string interpolation in SQL query
    const query = `SELECT * FROM orders WHERE id = ${id}`;
    try {
        const orders = db.exec(query);
        res.json({ orders: orders.length > 0 ? orders[0].values : [] });
    } catch (e) {
        res.status(400).send("Query error: " + e.message);
    }
});

// Directory Traversal (Download)
app.get('/download', (req, res) => {
    const { file } = req.query;
    // CRITICAL: User-controlled path allows traversal
    const filePath = path.join(__dirname, file);
    res.sendFile(filePath, err => {
        if (err) {
            res.status(404).send("File not found");
        }
    });
});

// Unsafe Dynamic Module Loading
app.get('/load-module', (req, res) => {
    const { name } = req.query;
    // CRITICAL: Require with user-controlled input
    try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const mod = require(name);
        res.json({ loaded: true, type: typeof mod });
    } catch (e) {
        res.status(400).send("Load failed: " + e.message);
    }
});
