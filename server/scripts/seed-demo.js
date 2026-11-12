// Adds realistic, date-relative demo data to an initialized database (see services/demoData.js).
// Safe to run again: it only adds what is missing.
//
// Usage: DEMO_PASSWORD='<shared demo password>' npm run db:demo --prefix server
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { connectionOptions } from "../config/dbOptions.js";
import { runMigrations } from "../database/migrate.js";
import { ensureDemoData, DEMO_DOMAIN } from "../services/demoData.js";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Set ALLOW_DEMO_SEED=1 to add demo data to a production database on purpose.");
}
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 8) throw new Error("Set DEMO_PASSWORD (at least 8 characters) for the demo accounts.");

const connection = await mysql.createConnection({ ...connectionOptions(), database: process.env.DB_NAME || "the_muscle_lab", multipleStatements: true, dateStrings: true });
try {
    await runMigrations(connection);
    await connection.beginTransaction();
    await ensureDemoData(connection, { password });
    await connection.commit();
    console.log(`Demo logins: member@${DEMO_DOMAIN} (member), trainer@${DEMO_DOMAIN} (trainer), password from DEMO_PASSWORD.`);
} catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
} finally {
    await connection.end();
}
