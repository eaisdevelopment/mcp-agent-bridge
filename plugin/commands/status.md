---
description: Check CC Bridge status -- list peers, health, and recent messages
---

Check the current state of the CC Bridge:

1. Call `cc_list_peers` to show all registered peers and their status
2. Call `cc_health_check` to verify bridge health
3. Call `cc_get_history` with limit 5 to show recent messages

Present the results in a clear summary. Flag any peers that appear stale
or any health check failures.
