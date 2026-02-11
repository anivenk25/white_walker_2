
const express = require('express');
const { getDatabase, saveDatabase } = require('./database');

const app = express();
const port = 3000;

// Security Misconfiguration: Disable security headers
// app.disable('x-powered-by'); // This would be a good thing to do, but we are leaving it for demonstration

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

app.listen(port, () => {
    console.log(`Vulnerable app listening at http://localhost:${port}`);
});

process.on('exit', () => {
    if (db) {
        saveDatabase(db);
        console.log('Database saved.');
    }
});
