import { API_BASE_URL as BASE_URL } from "./config.js";

async function apiRequest(
    endpoint,
    options = {}
) {

    const token =
        localStorage.getItem("token") ||
        sessionStorage.getItem("token");

    const headers = {
        ...options.headers,
    };

    if (!(options.body instanceof FormData)) {

        headers["Content-Type"] = "application/json";

    }

    if (token) {

        headers.Authorization = `Bearer ${token}`;

    }

    const response = await fetch(
        `${BASE_URL}${endpoint}`,
        {
            ...options,
            headers,
        }
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 && !endpoint.startsWith("/auth/")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
        window.location.href = "/login";
    }

    if (!response.ok) {

        throw {
            message: data.message,

            status: response.status,

            response: {
                status: response.status,
                data
            }
        };

    }

    return data;

}
export async function getClasses() {

    return await apiRequest("/classes");

}

export async function registerToClass(classId) {

    return await apiRequest(
        `/classes/${classId}/register`,
        {
            method: "POST"
        }
    );

}

export async function getMyClasses() {

    return await apiRequest("/classes/my");

}

export async function getClassDateCounts(start, end) {

    return await apiRequest(
        `/classes/date-counts?start=${start}&end=${end}`
    );

}

export async function getClassesByDate(date) {

    return await apiRequest(`/classes/by-date/${date}`);

}

export async function cancelClassRegistration(classId) {

    return await apiRequest(
        `/classes/${classId}/register`,
        {
            method: "DELETE"
        }
    );

}

export async function getUpcomingClasses() {
    return apiRequest("/classes?when=upcoming");
}

export async function joinWaitlist(classId) {
    return apiRequest(`/classes/${classId}/waitlist`, { method: "POST" });
}

export async function leaveWaitlist(classId) {
    return apiRequest(`/classes/${classId}/waitlist`, { method: "DELETE" });
}

export async function rateClass(classId, rating, comment) {
    return apiRequest(`/classes/${classId}/rating`, { method: "POST", body: JSON.stringify({ rating, comment }) });
}

export async function getFavorites() {
    return apiRequest("/me/favorites");
}

export async function setFavorite(activity, favorite) {
    return apiRequest(`/me/favorites/${encodeURIComponent(activity)}`, { method: favorite ? "PUT" : "DELETE" });
}

export async function getProgress() {
    return apiRequest("/me/progress");
}

export async function getClassesToRate() {
    return apiRequest("/me/to-rate");
}

export async function getNotifications() {
    return apiRequest("/notifications");
}

export async function markNotificationsRead(id) {
    return apiRequest("/notifications/read", { method: "POST", body: JSON.stringify(id ? { id } : {}) });
}

export async function sendCoachMessage(messages) {
    return apiRequest("/coach/chat", { method: "POST", body: JSON.stringify({ messages }) });
}

export async function getTrainerOverview() {
    return apiRequest("/trainer/overview");
}

export default apiRequest;