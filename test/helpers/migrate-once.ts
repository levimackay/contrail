import { migrate } from '../../src/store/schema.ts';
import { openDb } from '../../src/store/sqlite.ts';

const db = await openDb(process.argv[2]!);
migrate(db);
db.close();
