import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { connectionOptions } from "../config/dbOptions.js";
import { runMigrations } from "../database/migrate.js";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
const database = process.env.DB_NAME;
if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("Set DB_NAME to a database name containing only letters, numbers, and underscores");
}
const connection = await mysql.createConnection({
    ...connectionOptions(),
    multipleStatements: true
});
try {
    // CREATE (without IF NOT EXISTS) refuses existing databases. Never run DROP.
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.query(`USE \`${database}\``);
    const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
    const seed = await readFile(new URL("../database/seed.sql", import.meta.url), "utf8");
    await connection.query(schema.replace(/^(?:DROP DATABASE|CREATE DATABASE|USE )[^\n]*\n?/gm, ""));
    await connection.query(seed.replace(/^USE [^\n]*\n?/gm, ""));
    await runMigrations(connection, () => {});
    console.log("Created database, tables, migrations, and development seed data.");
} finally {
    await connection.end();
}
