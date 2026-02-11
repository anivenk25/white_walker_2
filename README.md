
# White Walker - A Vulnerable Web Application for Educational Purposes

This project is a small, intentionally vulnerable web application built with Node.js, Express, EJS, and sql.js. Its purpose is to demonstrate common web vulnerabilities in a controlled environment, allowing users to understand how these vulnerabilities work and how to exploit them.

## Setup

1.  **Clone the repository (or create the files manually as instructed by the agent).**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the application:**
    ```bash
    node server.js
    ```
4.  **Access the application:** Open your browser and navigate to `http://localhost:3000`.

## Vulnerabilities

This application is designed to be vulnerable to the following attacks:

### 1. SQL Injection

**Location:**
*   **Login Page (`/login`):** The login functionality is vulnerable to SQL injection.
*   **User Search (`/search`):** The user search functionality is also vulnerable to SQL injection.

**How to Exploit:**
*   **Login:** Try entering `' OR '1'='1` in the username field (and any password). This should bypass authentication and log you in as the first user (admin).
*   **Search:** Try entering `' OR '1'='1` in the search box to return all users. You can also try more complex queries to extract information.

### 2. Cross-Site Scripting (XSS)

**Location:**
*   **User Search Results (`/search`):** Reflected XSS.
*   **Comments Section (`/comments`):** Stored XSS.

**How to Exploit:**
*   **Search:** In the search box, try entering HTML tags or JavaScript code, e.g., `<script>alert('XSS')</script>`. When the search results are displayed, the script should execute.
*   **Comments:** In the "Add a comment" textarea, post a comment with JavaScript code, e.g., `<script>alert('Stored XSS')</script>`. When you (or any other user) view the comments page, the script will execute.

### 3. Insecure Direct Object Reference (IDOR)

**Location:**
*   **User Profile Page (`/profile/:id`):** The user profile page is directly accessible by ID.

**How to Exploit:**
*   After logging in, navigate to a profile page (e.g., `http://localhost:3000/profile/1`). Try changing the ID in the URL (e.g., `http://localhost:3000/profile/2`, `http://localhost:3000/profile/3`) to access other user profiles without proper authorization.

### 4. Security Misconfiguration / Lack of Security Headers

**Location:**
*   **Entire Application:** The `server.js` intentionally does not use security-enhancing middleware like `helmet`, and other default Express security features might be bypassed or misconfigured for demonstration purposes.

**How to Exploit:**
*   Examine the HTTP response headers using browser developer tools or a tool like `curl`. You will notice the absence of important security headers (e.g., `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`), making the application more susceptible to various attacks, including clickjacking and MIME type sniffing.

### 5. Vulnerable Dependencies

**Location:**
*   **`package.json`:** The project uses outdated versions of `express`, `ejs`, and `sql.js`.

**How to Exploit:**
*   Run `npm audit` to see a report of known vulnerabilities in the installed dependencies. These vulnerabilities might not be directly exploitable through the web interface but could pose risks if other parts of the application were more complex or exposed.

---

**Disclaimer:** This project is for educational purposes ONLY. Do not deploy this application to a production environment or use it for any malicious activities. The author is not responsible for any misuse or damage caused by this code.
