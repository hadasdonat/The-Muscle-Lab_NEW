import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionOptions, sessionTimeZone } from "../config/dbOptions.js";

test("TLS is off by default and verifies certificates when enabled", () => {
    assert.equal(connectionOptions({}).ssl, undefined);
    const options = connectionOptions({ DB_SSL: "true", DB_SSL_CA: "-----BEGIN-----\\nabc\\n-----END-----" });
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.equal(options.ssl.ca, "-----BEGIN-----\nabc\n-----END-----");
});

test("session time zone is written as a MySQL offset", () => {
    const winter = { getTimezoneOffset: () => -120 };
    const summer = { getTimezoneOffset: () => -180 };
    const west = { getTimezoneOffset: () => 330 };
    assert.equal(sessionTimeZone(winter), "+02:00");
    assert.equal(sessionTimeZone(summer), "+03:00");
    assert.equal(sessionTimeZone(west), "-05:30");
});
