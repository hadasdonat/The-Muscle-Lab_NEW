// Runs before the API starts on a hosted database:
// 1. an empty database gets the tables, roles and membership plans;
// 2. pending migrations are applied;
// 3. with DEMO_PASSWORD set, demo data is added or topped up (the schedule rolls forward).
// Every step is skipped when there is nothing to do, so it is safe on every start.
//
// Render start command: npm run start:hosted
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { connectionOptions, sessionTimeZone } from "../config/dbOptions.js";
import { runMigrations } from "../database/migrate.js";
import { ensureDemoData } from "../services/demoData.js";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
const database = process.env.DB_NAME;

async function main() {
    if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
        console.log("DB init: DB_NAME is not set, skipping.");
        return;
    }
    const connection = await mysql.createConnection({ ...connectionOptions(), database, multipleStatements: true, dateStrings: true });
    try {
        await connection.query(`SET time_zone = '${sessionTimeZone()}'`);
        const [tables] = await connection.query("SHOW TABLES LIKE 'Roles'");
        if (tables.length === 0) {
            const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
            const seed = await readFile(new URL("../database/seed.sql", import.meta.url), "utf8");
            await connection.query(schema.replace(/^(?:DROP DATABASE|CREATE DATABASE|USE )[^\n]*\n?/gm, ""));
            // Only roles and plans from the local seed; its accounts have a published password.
            await connection.query(seed.slice(seed.indexOf("-- Roles"), seed.indexOf("-- Users")));
            console.log("DB init: created tables, roles and membership plans.");
        }
        await runMigrations(connection, message => console.log(`DB init: ${message}`));
        if (process.env.DEMO_PASSWORD) {
            await connection.beginTransaction();
            try {
                await ensureDemoData(connection, { password: process.env.DEMO_PASSWORD, log: message => console.log(`DB init: ${message}`) });
                await connection.commit();
            } catch (error) {
                await connection.rollback();
                throw error;
            }
        }
    } finally {
        await connection.end();
    }
}

try {
    await main();
} catch (error) {
    // Log and carry on, so the API still starts and the error is visible in the platform logs.
    console.error(`DB init failed: ${error.message}`);
}
