const fs = require('fs');
const code = fs.readFileSync('../supabase/functions/server/index.tsx', 'utf8');

// Strip out Deno-specific imports to parse with standard babel/acorn or just rely on node's syntax check
try {
  require('vm').runInNewContext(code.replace(/import .*;?/g, ''));
  console.log('No obvious JS syntax errors (but there might be TS type errors)');
} catch (e) {
  console.log('Syntax error:', e);
}