---
description: Set up a CC Bridge demo with two sample projects
---

Guide the user through setting up the CC Bridge demo:

1. Explain that the demo creates two projects:
   - **api-server**: Express.js backend with a planted bug
   - **web-client**: Node.js frontend that exposes the bug
2. Run the init wizard:
   ```bash
   npx -y @essentialai/cc-bridge-mcp-server init
   ```
3. After the wizard completes, guide the user to:
   - Open two terminals
   - Start the API server (`cd api-server && npm install && node server.js`)
   - Launch Claude Code in each project directory
   - Register each session on the bridge
   - Have the frontend discover and report bugs to the backend
