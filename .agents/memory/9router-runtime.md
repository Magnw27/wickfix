---
name: 9Router runtime SQLite
description: Replit's package firewall can prevent 9Router from installing its user-runtime SQLite driver.
---

9Router stores runtime dependencies under `~/.9router/runtime`, separate from the project dependency tree. In this environment, installing `better-sqlite3` in the project and linking it into that runtime is more reliable than relying on 9Router's first-run npm install.

**Why:** The runtime installer can leave only `sql.js` available, while the bundled server may still fail database initialization during authentication.

**How to apply:** Keep the project-native driver installed and recreate the runtime link during every 9Router workflow start. Remote access also requires replacing the default password; that is an intentional security policy, not a SQLite failure.

After upgrading 9Router, verify authentication immediately: in this environment the previously configured password was no longer accepted after an upgrade, and recovery required the local initial-password flow before setting a new remote password.

**Why:** A successful package update and healthy port do not guarantee that the persisted authentication state remained usable.

**How to apply:** Test local and public login after every 9Router upgrade; recover locally before exposing the service if the old password returns `401`.