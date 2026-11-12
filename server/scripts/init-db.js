// Prepares an existing, empty hosted database on first start, then exits so the server can start.
// It creates the tables, adds the roles and membership plans, and (when DEMO_PASSWORD is set)
// the demo data. If the tables already exist it does nothing, so it is safe on every deploy.
//
// Render start command: npm run start:hosted
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { connectionOptions } from "../config/dbOptions.js";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
const database = process.env.DB_NAME;

async function main() {
    if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
        console.log("DB init: DB_NAME is not set, skipping.");
        return;
    }
    const connection = await mysql.createConnection({ ...connectionOptions(), database, multipleStatements: true });
    try {
        const [tables] = await connection.query("SHOW TABLES LIKE 'Roles'");
        if (tables.length > 0) {
            console.log("DB init: tables already exist, nothing to do.");
            return;
        }
        const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
        const seed = await readFile(new URL("../database/seed.sql", import.meta.url), "utf8");
        await connection.query(schema.replace(/^(?:DROP DATABASE|CREATE DATABASE|USE )[^\n]*\n?/gm, ""));
        // Only roles and plans from the local seed; its accounts have a published password.
        const reference = seed.slice(seed.indexOf("-- Roles"), seed.indexOf("-- Users"));
        await connection.query(reference);
        console.log("DB init: created tables, roles and membership plans.");
    } finally {
        await connection.end();
    }

    if (process.env.DEMO_PASSWORD) {
        const result = spawnSync(process.execPath, [fileURLToPath(new URL("./seed-demo.js", import.meta.url))], {
            env: { ...process.env, ALLOW_DEMO_SEED: "1" },
            stdio: "inherit"
        });
        if (result.status !== 0) console.error("DB init: demo data could not be added.");
    }
}

try {
    await main();
} catch (error) {
    // Log and carry on, so the API still starts and the error is visible in the platform logs.
    console.error(`DB init failed: ${error.message}`);
}
