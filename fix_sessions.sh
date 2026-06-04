#!/bin/bash
head -n 185 src/server/routes/sessions.ts > /tmp/part1.ts
echo '    .replace(/^\.+/, "")' > /tmp/part2.ts
tail -n +187 src/server/routes/sessions.ts > /tmp/part3.ts
cat /tmp/part1.ts /tmp/part2.ts /tmp/part3.ts > src/server/routes/sessions.ts
