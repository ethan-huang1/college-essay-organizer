// Throwaway PGlite-over-socket Postgres for local review. Not production:
// .env.local's DATABASE_URL points at the real Neon database, and shell env
// beats it. Temporary, untracked, delete when the review is done.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create({ dataDir: process.env.PGLITE_DIR });
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1", maxConnections: 200 });
await server.start();
console.log("pglite listening on 5433");
process.on("SIGINT", async () => { await server.stop(); await db.close(); process.exit(0); });
