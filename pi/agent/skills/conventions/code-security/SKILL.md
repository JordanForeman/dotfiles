---
name: code-security
description: Task involves writing code that handles user input, external data, authentication, authorization, or network operations
injection: classify
---

Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice insecure code, fix it immediately. Prioritize writing safe, secure, and correct code.

Don't add unnecessary error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).
