import { homedir } from 'node:os';
import { main } from './cli.ts';

process.umask(0o077);
process.exitCode = await main(process.argv.slice(2), {
  out: s => process.stdout.write(s),
  err: s => process.stderr.write(s),
  cwd: process.cwd(),
  env: process.env,
  home: homedir(),
  isTTY: process.stdout.isTTY === true,
});
