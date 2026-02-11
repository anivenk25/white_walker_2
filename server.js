
const express = require('express');
const { getDatabase, saveDatabase } = require('./database');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const port = 3000;

// Security Misconfiguration: Disable security headers
// app.disable('x-powered-by'); // This would be a good thing to do, but we are leaving it for demonstration

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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
