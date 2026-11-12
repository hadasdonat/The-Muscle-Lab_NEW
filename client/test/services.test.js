import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { saveLogin, getCurrentUser, getToken, logout } from "../src/services/authService.js";
import apiRequest from "../src/services/api.js";
import { profileImageUrl } from "../src/services/config.js";
import { formatClassTime, getCoachInsight } from "../src/services/aiService.js";

function storage() {
    const map = new Map();
    return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}
beforeEach(() => {
    globalThis.localStorage = storage();
    globalThis.sessionStorage = storage();
    globalThis.window = { location: { href: "/" } };
});
test("switching persistent and session logins does not retain the previous account", () => {
    saveLogin("first-token", { role: "Admin" }, true);
    saveLogin("second-token", { role: "Member" }, false);
    assert.equal(localStorage.getItem("token"), null);
    assert.equal(getToken(), "second-token");
    assert.equal(getCurrentUser().role, "Member");
    logout();
    assert.equal(getToken(), null);
});
test("invalid stored JSON returns no user instead of crashing routes", () => {
    localStorage.setItem("user", "invalid-json");
    assert.equal(getCurrentUser(), null);
});
test("failed login preserves the API error without redirecting away from the form", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "invalid email or password" }), { status: 401 });
    await assert.rejects(apiRequest("/auth/login", { method: "POST" }), error => error.status === 401 && error.message === "invalid email or password");
    assert.equal(window.location.href, "/");
});
test("expired API sessions clear credentials and redirect", async () => {
    saveLogin("expired", { role: "Member" }, true);
    globalThis.fetch = async () => new Response("{}", { status: 401 });
    await assert.rejects(apiRequest("/users/profile"), error => error.status === 401);
    assert.equal(getToken(), null);
    assert.equal(window.location.href, "/login");
});
test("non-JSON API errors are reported instead of failing JSON parsing", async () => {
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(apiRequest("/classes"), error => error.status === 503);
});
test("profile images resolve against the API and do not send names to external avatar services", () => {
    assert.equal(profileImageUrl("/uploads/profile-images/test.png"), "http://localhost:3000/uploads/profile-images/test.png");
    assert.equal(profileImageUrl(null), "/avatar.svg");
    assert.equal(profileImageUrl("https://example.invalid/avatar.png"), "https://example.invalid/avatar.png");
    assert.equal(profileImageUrl("javascript:invalid"), "/avatar.svg");
});
test("coach asks the server for a suggestion and never calls a model from the browser", async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ source: "rules", summary: "Hi Demo", suggestion: null, reasons: [] }) };
    };
    const result = await getCoachInsight({ refresh: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://localhost:3000/api/coach/insight?refresh=1");
    assert.equal(calls[0].init.body, undefined);
    assert.match(result.summary, /Demo/);
});
test("suggested class times are formatted from calendar dates", () => {
    assert.equal(formatClassTime({ date: "2026-11-17", startTime: "18:00", endTime: "19:00" }), "Tue 17 Nov · 18:00–19:00");
    assert.equal(formatClassTime(null), "");
});
