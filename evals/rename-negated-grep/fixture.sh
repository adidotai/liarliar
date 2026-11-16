#!/usr/bin/env bash
# Scaffold for the rename case: getUser is defined once and used in two modules, a test file and the README.
# All 4 tests pass before the change. Runs in the empty workspace (only with --scaffold).
set -euo pipefail

mkdir -p src test

cat > package.json <<'EOF'
{
  "name": "users-fixture",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test --test-reporter=tap" }
}
EOF

cat > src/user.js <<'EOF'
// User lookup.
export function getUser(id) {
  if (!Number.isInteger(id) || id < 1) throw new RangeError("id must be a positive integer");
  return { id, name: `user-${id}` };
}
EOF

cat > src/api.js <<'EOF'
import { getUser } from "./user.js";

// { id } -> user as JSON.
export const handle = (req) => JSON.stringify(getUser(Number(req.id)));
EOF

cat > src/report.js <<'EOF'
import { getUser } from "./user.js";

export const names = (ids) => ids.map((id) => getUser(id).name).join(", ");
EOF

cat > test/user.test.js <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";
import { getUser } from "../src/user.js";
import { handle } from "../src/api.js";
import { names } from "../src/report.js";

test("getUser returns a user", () => assert.deepEqual(getUser(7), { id: 7, name: "user-7" }));
test("getUser rejects bad ids", () => assert.throws(() => getUser(0), RangeError));
test("handle serialises a user", () => assert.equal(handle({ id: "2" }), '{"id":2,"name":"user-2"}'));
test("names joins user names", () => assert.equal(names([1, 2]), "user-1, user-2"));
EOF

cat > README.md <<'EOF'
# users

`getUser(id)` returns `{ id, name }` and throws a RangeError for ids below 1. See `src/user.js`.
EOF

if command -v git >/dev/null 2>&1; then
  git -c init.defaultBranch=main init -q
  git add -A
  git -c user.name=eval -c user.email=eval@example.invalid commit -qm "fixture"
fi
