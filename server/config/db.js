import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectionOptions, sessionTimeZone } from "./dbOptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const pool = mysql.createPool({
    ...connectionOptions(),
    database: process.env.DB_NAME || "the_muscle_lab",

    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true
});

// Run once per new connection, before it serves any query.
pool.pool.on("connection", connection => {
    connection.query(`SET time_zone = '${sessionTimeZone()}'`);
});

export default pool;
