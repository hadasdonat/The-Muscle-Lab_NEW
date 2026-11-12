import { readdir, readFile } from "node:fs/promises";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);
// schema.sql already contains this change, so databases created from it start past it.
const BASELINE = ["001_attendance_unique.sql"];

// Applies every migration file that hasn't run yet, in name order.
// The connection must be opened with multipleStatements: true.
export async function runMigrations(connection, log = console.log) {
    await connection.query(
        `CREATE TABLE IF NOT EXISTS SchemaMigrations (
            name VARCHAR(100) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    );
    const [rows] = await connection.query("SELECT name FROM SchemaMigrations");
    const applied = new Set(rows.map(row => row.name));
    if (applied.size === 0) {
        for (const name of BASELINE) {
            await connection.query("INSERT INTO SchemaMigrations (name) VALUES (?)", [name]);
            applied.add(name);
        }
    }
    const files = (await readdir(MIGRATIONS_DIR)).filter(name => name.endsWith(".sql")).sort();
    const ran = [];
    for (const name of files) {
        if (applied.has(name)) continue;
        await connection.query(await readFile(new URL(name, MIGRATIONS_DIR), "utf8"));
        await connection.query("INSERT INTO SchemaMigrations (name) VALUES (?)", [name]);
        ran.push(name);
        log(`Migration applied: ${name}`);
    }
    return ran;
}
