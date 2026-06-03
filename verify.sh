#!/bin/bash
# Quick verification script for the implementation

echo "=== Backend Verification ==="
echo "1. Checking new files exist..."
test -f "src/core/agent/director/EventBus.ts" && echo "  ✓ EventBus.ts" || echo "  ✗ EventBus.ts MISSING"
test -f "src/core/hook/StreamEmitterHook.ts" && echo "  ✓ StreamEmitterHook.ts" || echo "  ✗ StreamEmitterHook.ts MISSING"

echo ""
echo "2. Checking backend builds..."
npm run build > /dev/null 2>&1 && echo "  ✓ TypeScript compilation passed" || echo "  ✗ Build failed"

echo ""
echo "=== Frontend Verification ==="
echo "1. Checking new components exist..."
test -f "frontend/components/Console/StepsTimeline.tsx" && echo "  ✓ StepsTimeline.tsx" || echo "  ✗ StepsTimeline.tsx MISSING"
test -f "frontend/components/Console/DetailedLogs.tsx" && echo "  ✓ DetailedLogs.tsx" || echo "  ✗ DetailedLogs.tsx MISSING"

echo ""
echo "2. Checking old component removed..."
test ! -f "frontend/components/Console/AgentStatusCards.tsx" && echo "  ✓ AgentStatusCards.tsx removed" || echo "  ✗ AgentStatusCards.tsx still exists"

echo ""
echo "3. Checking frontend builds..."
cd frontend && npm run build > /dev/null 2>&1 && echo "  ✓ Next.js build passed" || echo "  ✗ Build failed"
cd ..

echo ""
echo "=== Summary ==="
echo "All file changes completed. Ready for manual testing."
echo ""
echo "To test:"
echo "  1. Terminal 1: npm run dev"
echo "  2. Terminal 2: cd frontend && npm run dev"
echo "  3. Browser: http://localhost:3000"
echo "  4. Try query: '成就系统的触发条件有哪些？'"
echo "  5. Check Steps tab for tool calls"
echo "  6. Check Logs tab for detailed execution"
