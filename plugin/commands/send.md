---
description: Send a message to another peer on the CC Bridge
---

Send a message to another peer on the CC Bridge.

Parse $ARGUMENTS for:
- First word: target peer ID
- Remaining text: message content

If no arguments provided, first call `cc_list_peers` to show available
targets, then ask the user who to message and what to say.

Use `cc_send_message` with the current session's registered peer ID as
`fromPeerId`. If this session is not registered yet, suggest running
`/cc-bridge:register` first.
