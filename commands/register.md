---
description: Register this session on the Cogent Bridge as a peer
---

Register this Claude Code session on the Cogent Bridge.

If arguments were provided ($ARGUMENTS), parse them as: `<peerId> [label]`.
Otherwise, derive defaults from the current directory name.

Follow the bridge-setup skill:
1. Discover the current session ID via filesystem lookup
2. Register using `cogent_register_peer`
3. Report the result and list available peers with `cogent_list_peers`
