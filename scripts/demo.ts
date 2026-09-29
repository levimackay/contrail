/**
 * npm run demo: builds a sample repository and two recorded Claude Code sessions
 * in a temporary directory, so you can try every Contrail command without installing anything.
 */
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDemo } from '../test/fixtures/demo.ts';

const root = join(realpathSync(tmpdir()), 'contrail-demo');
const { repo, data, sha } = buildDemo(root);
const cli = `node ${join(import.meta.dirname, '..', 'src', 'main.ts')}`;

console.log(`Demo repository: ${repo}
Recorded sessions: ${data}

Try:
  cd ${repo}
  export CONTRAIL_HOME=${data}
  ${cli} sessions
  ${cli} why "npm install jwt-decode"
  ${cli} why auth-service/src/session.ts
  ${cli} why commit ${sha.slice(0, 7)}
  ${cli} risks
  ${cli} trace --session 4f2a
`);
