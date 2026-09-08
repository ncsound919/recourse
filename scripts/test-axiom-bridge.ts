import 'dotenv/config';
import { axiomReachable, integrateAxiomTool } from '../src/lib/axiomBridge.js';
import { listSelfHostedEntries, executeSelfHostedTool } from '../src/lib/selfHosting.js';

async function main() {
  console.log('=== Testing Recourse <-> Axiom Bridge ===');
  
  const reachable = await axiomReachable();
  console.log(`1. Axiom reachable: ${reachable ? 'YES (http://127.0.0.1:3198)' : 'NO'}`);
  if (!reachable) {
    console.error('Axiom is not running on :3198');
    process.exit(1);
  }

  console.log('\n2. Asking Axiom to build and self-host tool: `levenshteinDistance`...');
  const res = await integrateAxiomTool(
    'levenshteinDistance',
    'systemic',
    'Implement `export function levenshteinDistance(a, b)`. Return the minimum number of single-character edits (insert, delete, substitute) to turn string a into string b. Examples: ("kitten","sitting")=3, ("flaw","lawn")=2, ("","abc")=3, ("same","same")=0, ("a","b")=1. Use dynamic programming.',
    'assert levenshteinDistance("kitten","sitting") === 3;\nassert levenshteinDistance("flaw","lawn") === 2;\nassert levenshteinDistance("","abc") === 3;\nassert levenshteinDistance("same","same") === 0;\nassert levenshteinDistance("a","b") === 1;'
  );

  console.log('Build & Integration Result:', {
    ok: res.ok,
    name: res.selfHosted?.name,
    domain: res.selfHosted?.domain,
    file: res.selfHosted?.file,
    summary: res.selfHosted?.summary,
    error: res.error
  });

  if (!res.ok) {
    console.error('Failed to integrate tool:', res.error);
    process.exit(1);
  }

  console.log('\n3. Testing execution of self-hosted tool inside Recourse...');
  const exec1 = await executeSelfHostedTool('levenshteinDistance', {
    method: 'levenshteinDistance',
    args: ['kitten', 'sitting']
  });
  console.log('execute("kitten", "sitting") ->', exec1);

  const exec2 = await executeSelfHostedTool('levenshteinDistance', {
    method: 'levenshteinDistance',
    args: ['flaw', 'lawn']
  });
  console.log('execute("flaw", "lawn") ->', exec2);

  console.log('\n4. Live self-hosted manifest check:');
  const entries = listSelfHostedEntries();
  const entry = entries.find(e => e.name === 'levenshteinDistance');
  console.log(`Found in manifest: ${entry ? 'YES (' + entry.file + ')' : 'NO'}`);

  console.log('\n=== RECOURSE <-> AXIOM BRIDGE TEST PASSED! ===');
}

main().catch(err => {
  console.error('Test threw exception:', err);
  process.exit(1);
});
