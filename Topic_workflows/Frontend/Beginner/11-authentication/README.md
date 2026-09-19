# Authentication — Beginner Guide

## What is authentication, really?

Authentication is the process of proving **who you are** to a system. Think of it like showing your ID at an airport — you're proving you are who you claim to be. This is different from **authorization**, which is about **what you're allowed to do** once the system knows who you are (like whether your boarding pass lets you into first class).

In web apps, authentication usually happens once (you log in), and the server then needs a way to "remember" you on every future request — because HTTP is **stateless**, meaning each request is treated independently, with no memory of previous ones by default.

This guide covers five ways apps solve this problem: **Session Auth**, **JWT**, **OAuth**, **SSO**, and **Basic Auth**. By the end, you'll understand how each works and why one might be chosen over another.

---

## 1. Session-Based Authentication

This is the "classic" way websites have worked for decades.

### How it works, step by step

1. You submit your username and password on a login form.
2. The server checks your credentials against its database.
3. If correct, the server creates a **session** — a record stored in server memory or a database (e.g., Redis) containing your user ID and other info.
4. The server generates a random **session ID** (just a long random string) and sends it back to your browser inside a `Set-Cookie` header.
5. Your browser automatically stores this cookie and sends it back with **every subsequent request** to that domain.
6. The server looks up the session ID in its store on each request to know who you are.

```mermaid
sequenceDiagram
    participant Browser
    participant Server
    participant SessionStore as Session Store (DB/Redis)

    Browser->>Server: POST /login (username, password)
    Server->>Server: Verify credentials
    Server->>SessionStore: Create session {id: "abc123", userId: 42}
    Server-->>Browser: Set-Cookie: sessionId=abc123
    Note over Browser: Cookie saved automatically

    Browser->>Server: GET /dashboard (Cookie: sessionId=abc123)
    Server->>SessionStore: Look up session "abc123"
    SessionStore-->>Server: {userId: 42}
    Server-->>Browser: Dashboard HTML for user 42
```

### Code example (Express.js)

```javascript
const express = require('express');
const session = require('express-session');
const app = express();

app.use(session({
  secret: 'a-very-secret-key', // used to sign the session ID cookie
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, maxAge: 1000 * 60 * 60 } // 1 hour
}));

app.post('/login', (req, res) => {
  // Imagine we already validated username/password here
  req.session.userId = 42; // Express stores this server-side
  res.send('Logged in!');
});

app.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('Please log in');
  }
  res.send(`Welcome, user ${req.session.userId}`);
});
```

**Why this matters:** Sessions are easy to revoke — just delete the session from the server's store and the user is instantly logged out everywhere. The downside is the server has to store data for every logged-in user, which can be harder to scale across multiple servers.

---

## 2. JWT (JSON Web Token)

JWT stands for **JSON Web Token**. Instead of the server storing session data, the server packs the user's info directly into a signed token and gives it to the browser. The browser then sends this token back on every request, and the server verifies the signature — no database lookup needed.

### Structure of a JWT

A JWT looks like this: `xxxxx.yyyyy.zzzzz` — three parts separated by dots.

| Part | Name | Contents |
|------|------|----------|
| `xxxxx` | **Header** | Metadata: algorithm used (e.g., `HS256`) and token type (`JWT`) |
| `yyyyy` | **Payload** | The actual data ("claims"), e.g., `{ "userId": 42, "exp": 1699999999 }` |
| `zzzzz` | **Signature** | A cryptographic signature proving the token wasn't tampered with |

Each part is Base64-encoded (not encrypted!) — meaning **anyone can read the payload** by decoding it. Never put secrets like passwords inside a JWT payload.

### Login/token flow

```mermaid
sequenceDiagram
    participant Browser
    participant Server

    Browser->>Server: POST /login (username, password)
    Server->>Server: Verify credentials
    Server->>Server: Create JWT signed with secret key
    Server-->>Browser: { token: "xxxxx.yyyyy.zzzzz" }
    Note over Browser: Store token (e.g., in memory or localStorage)

    Browser->>Server: GET /dashboard (Authorization: Bearer xxxxx.yyyyy.zzzzz)
    Server->>Server: Verify signature using secret key
    Server-->>Browser: Dashboard data (no DB lookup needed!)
```

### Code example (Node.js with `jsonwebtoken`)

```javascript
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET; // never hardcode this!

// On login:
function createToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role }, // payload
    SECRET_KEY,
    { expiresIn: '1h' } // token expires in 1 hour
  );
}

// On each protected request:
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization; // "Bearer xxxxx.yyyyy.zzzzz"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).send('No token provided');

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(403).send('Invalid or expired token');
  }
}
```

**Why this matters:** JWTs are **stateless** — the server doesn't need to remember anything, which makes it easy to scale across many servers. The tradeoff: you can't easily "cancel" a JWT before it expires, because there's no central record to delete (more on this below).

---

## 3. OAuth

OAuth is **not** about proving who you are directly — it's about **delegated authorization**. It lets you say "I want App A to access some of my data on Service B, without giving App A my Service B password."

The classic example: "Sign in with Google." You're not giving the app your Google password — you're letting Google tell the app "yes, this is a real user, and they said it's okay for you to see their email address."

### Key players

- **Resource Owner**: You, the user.
- **Client**: The app requesting access (e.g., "CoolPhotoApp").
- **Authorization Server**: The service that authenticates you (e.g., Google).
- **Resource Server**: Where your data actually lives (e.g., Google's API).

### Authorization Code Flow (the most common and secure flow)

```mermaid
sequenceDiagram
    participant User
    participant App as Client App
    participant Auth as Authorization Server (Google)
    participant API as Resource Server

    User->>App: Click "Sign in with Google"
    App->>Auth: Redirect to Google login (with client_id, redirect_uri)
    User->>Auth: Enter Google credentials, approve access
    Auth-->>App: Redirect back with authorization code
    App->>Auth: Exchange code for access token (with client_secret)
    Auth-->>App: Access token (+ optional refresh token)
    App->>API: Request user data (Authorization: Bearer access_token)
    API-->>App: User's profile/email data
```

### Why the "code" step instead of sending the token directly?

The authorization code is exchanged for a token in a **server-to-server** call, using a `client_secret` that never touches the browser. This prevents the access token from being exposed in browser history, redirect URLs, or logs.

**Why this matters:** OAuth lets you use third-party services without ever handing them your password. It's the backbone of "Sign in with Google/GitHub/Facebook" buttons you see everywhere.

---

## 4. SSO (Single Sign-On)

SSO lets a user log in **once** and gain access to **multiple related applications** without logging in again for each one. Think of a company where logging into your email also logs you into the HR portal, Slack, and internal wiki — all through one login screen.

SSO is typically built using protocols like **SAML** or **OAuth/OIDC (OpenID Connect)** under the hood. A central **Identity Provider (IdP)** holds your credentials, and each app (a "Service Provider") trusts the IdP's confirmation that you're logged in.

```mermaid
sequenceDiagram
    participant User
    participant App1 as HR Portal
    participant App2 as Wiki
    participant IdP as Identity Provider

    User->>App1: Visit HR Portal
    App1->>IdP: Redirect to login (not authenticated yet)
    User->>IdP: Enter credentials once
    IdP-->>App1: Authentication token
    App1-->>User: Access granted

    User->>App2: Visit Wiki
    App2->>IdP: Redirect to check session
    IdP-->>App2: Already authenticated! (no login prompt)
    App2-->>User: Access granted, no re-login needed
```

**Why this matters:** SSO reduces password fatigue and centralizes security — if a user leaves a company, disabling their IdP account instantly locks them out of every connected app.

---

## 5. Basic Auth

The simplest (and weakest) form of authentication. The browser sends your username and password on **every single request**, encoded (not encrypted!) in Base64 inside an HTTP header.

```
Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=
```

That string is just `username:password` Base64-encoded — anyone who intercepts it can trivially decode it back to plain text. This is why Basic Auth should **only** ever be used over HTTPS, and even then it's mostly reserved for internal tools, quick prototypes, or API-to-API communication — not consumer-facing apps.

```javascript
// Example: sending Basic Auth from the browser
fetch('/api/data', {
  headers: {
    Authorization: 'Basic ' + btoa('username:password')
  }
});
```

**Why this matters:** It's dead simple to implement, but offers no way to log out, no expiration, and re-sends the password on every request — a real liability if intercepted.

---

## Comparing Session Auth vs JWT

| Aspect | Session Auth | JWT |
|--------|-------------|-----|
| **State** | Stateful (server stores session data) | Stateless (all data lives in the token) |
| **Revocation** | Easy — delete session server-side | Hard — token is valid until it expires unless you build a blocklist |
| **Scalability** | Needs shared session store (e.g., Redis) across servers | Scales easily — any server can verify the token independently |
| **Size on wire** | Small (just a session ID) | Larger (full payload sent every request) |
| **Common storage** | HTTP-only cookie | localStorage, memory, or cookie |

---

## Where this fits

Authentication Strategies sits after Testing and before Web Security Basics in the frontend roadmap — understanding how users are identified is the foundation for the security concepts (CORS, CSP, XSS/CSRF) covered next.
