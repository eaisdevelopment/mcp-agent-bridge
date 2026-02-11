---
description: Register this session on the CC Bridge as a peer
---

Register this Claude Code session on the CC Bridge.

If arguments were provided ($ARGUMENTS), parse them as: `<peerId> [label]`.
Otherwise, derive defaults from the current directory name.

Follow the bridge-setup skill:
1. Discover the current session ID via filesystem lookup
2. Register using `cc_register_peer`
3. Report the result and list available peers with `cc_list_peers`
