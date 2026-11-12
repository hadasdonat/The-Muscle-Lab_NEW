// Connection settings shared by the app pool and the setup scripts.
// Hosted MySQL services (TiDB Cloud, Aiven, Railway, PlanetScale-style hosts) require TLS:
// set DB_SSL=true, and DB_SSL_CA to the provider's CA certificate if it isn't publicly trusted.
export function connectionOptions(env = process.env) {
    const options = {
        host: env.DB_HOST || "localhost",
        port: Number(env.DB_PORT || 3306),
        user: env.DB_USER || "root",
        password: env.DB_PASSWORD ?? ""
    };
    if (env.DB_SSL === "true") {
        options.ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
        if (env.DB_SSL_CA) options.ssl.ca = env.DB_SSL_CA.replace(/\\n/g, "\n");
    }
    return options;
}

// Class times are stored as local wall-clock times, so NOW() must use the gym's time zone,
// not the database server's (hosted databases usually run in UTC). The offset follows the
// Node process time zone, which is set with TZ (for example TZ=Asia/Jerusalem).
export function sessionTimeZone(date = new Date()) {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
}
