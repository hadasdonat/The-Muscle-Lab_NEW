import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { getNotifications, markNotificationsRead } from "../../services/api";
import "./NotificationBell.css";

function timeAgo(value) {
    const [datePart, timePart = "00:00:00"] = String(value).split(" ");
    const [y, m, d] = datePart.split("-").map(Number);
    const [h, min] = timePart.split(":").map(Number);
    const minutes = Math.round((Date.now() - new Date(y, m - 1, d, h, min)) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
    return `${Math.round(minutes / 1440)} d ago`;
}

function NotificationBell() {
    const [data, setData] = useState({ unread: 0, items: [] });
    const [open, setOpen] = useState(false);
    const panel = useRef(null);
    const navigate = useNavigate();

    const load = useCallback(async () => {
        try { setData(await getNotifications()); } catch { /* the bell stays quiet if this fails */ }
    }, []);

    useEffect(() => {
        load();
        const timer = setInterval(load, 60000);
        return () => clearInterval(timer);
    }, [load]);

    useEffect(() => {
        if (!open) return undefined;
        const close = event => { if (!panel.current?.contains(event.target)) setOpen(false); };
        const onKey = event => { if (event.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
    }, [open]);

    async function openItem(item) {
        if (!item.read_at) setData(await markNotificationsRead(item.id).catch(() => data));
        setOpen(false);
        if (item.link) navigate(item.link);
    }

    async function readAll() {
        setData(await markNotificationsRead().catch(() => data));
    }

    return (
        <div className="bell" ref={panel}>
            <button type="button" className="bell-button" aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`} aria-expanded={open} onClick={() => { setOpen(!open); if (!open) load(); }}>
                <Bell size={20} />
                {data.unread > 0 && <span className="bell-count">{data.unread > 9 ? "9+" : data.unread}</span>}
            </button>
            {open && (
                <div className="bell-panel" role="dialog" aria-label="Notifications">
                    <div className="bell-head">
                        <strong>Notifications</strong>
                        {data.unread > 0 && <button type="button" onClick={readAll}><CheckCheck size={14} /> Mark all read</button>}
                    </div>
                    {data.items.length === 0 ? (
                        <p className="bell-empty">You're all caught up. Waitlist updates and news show up here.</p>
                    ) : (
                        <ul>
                            {data.items.map(item => (
                                <li key={item.id}>
                                    <button type="button" className={item.read_at ? "" : "unread"} onClick={() => openItem(item)}>
                                        <span className="bell-title">{item.title}</span>
                                        {item.body && <span className="bell-body">{item.body}</span>}
                                        <span className="bell-time">{timeAgo(item.created_at)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export default NotificationBell;
