import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, CalendarDays, Check, X } from "lucide-react";
import apiRequest from "../../services/api";
import "./Attendance.css";

function formatDay(dateKey) {
    const [year, month, day] = String(dateKey).split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function classStatus(gymClass) {
    if (!gymClass.has_started) return { label: "Upcoming", tone: "muted" };
    if (gymClass.registered_count === 0) return { label: "No bookings", tone: "muted" };
    if (gymClass.recorded_count < gymClass.registered_count) return { label: "To record", tone: "warn" };
    return { label: `${gymClass.attended_count}/${gymClass.registered_count} attended`, tone: "ok" };
}

function AttendancePage() {
    const [classes, setClasses] = useState([]);
    const [listStatus, setListStatus] = useState("loading");
    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [marks, setMarks] = useState({});
    const [detailStatus, setDetailStatus] = useState("idle");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const detailRequest = useRef(0);

    const loadClasses = useCallback(async () => {
        setListStatus("loading");
        try {
            const data = await apiRequest("/attendance/classes");
            setClasses(data.classes);
            setListStatus("ready");
            setSelectedId(current => current ?? (data.classes.find(c => c.has_started && c.recorded_count < c.registered_count) || data.classes.find(c => c.has_started))?.id ?? null);
        } catch (error) {
            setListStatus(error.message || "Classes could not be loaded.");
        }
    }, []);

    useEffect(() => {
        loadClasses();
    }, [loadClasses]);

    useEffect(() => {
        if (!selectedId) return;
        const current = ++detailRequest.current;
        setDetailStatus("loading");
        setMessage(null);
        apiRequest(`/attendance/classes/${selectedId}`)
            .then(data => {
                if (current !== detailRequest.current) return;
                setDetail(data);
                setMarks(Object.fromEntries(data.roster.map(row => [row.registration_id, row.attended])));
                setDetailStatus("ready");
            })
            .catch(error => {
                if (current !== detailRequest.current) return;
                setDetailStatus(error.message || "This class could not be loaded.");
            });
    }, [selectedId]);

    // Past classes first (most recent on top), then the upcoming ones (soonest on top).
    const groups = useMemo(() => [
        { label: "Past classes", items: classes.filter(c => c.has_started) },
        { label: "Upcoming", items: classes.filter(c => !c.has_started).reverse() }
    ].filter(group => group.items.length > 0), [classes]);

    const changed = useMemo(() => {
        if (!detail) return [];
        return detail.roster.filter(row => marks[row.registration_id] !== null && marks[row.registration_id] !== row.attended);
    }, [detail, marks]);

    function setMark(registrationId, attended) {
        setMarks(current => ({ ...current, [registrationId]: attended }));
        setMessage(null);
    }

    function markAll(attended) {
        setMarks(Object.fromEntries(detail.roster.map(row => [row.registration_id, attended])));
        setMessage(null);
    }

    async function save() {
        if (changed.length === 0) return;
        setSaving(true);
        setMessage(null);
        try {
            const data = await apiRequest(`/attendance/classes/${selectedId}`, {
                method: "PUT",
                body: JSON.stringify({ records: changed.map(row => ({ registrationId: row.registration_id, attended: marks[row.registration_id] })) })
            });
            setDetail(data);
            setMarks(Object.fromEntries(data.roster.map(row => [row.registration_id, row.attended])));
            setMessage({ tone: "ok", text: "Attendance saved." });
            loadClasses();
        } catch (error) {
            setMessage({ tone: "error", text: error.message || "Attendance could not be saved." });
        } finally {
            setSaving(false);
        }
    }

    const gymClass = detail?.class;
    const canEdit = Boolean(gymClass?.has_started);

    return (
        <div className="attendance-page">
            <div className="attendance-header">
                <div>
                    <p className="attendance-eyebrow">Class attendance</p>
                    <h1>Who came to class</h1>
                </div>
                <p className="attendance-range">Last 14 days and the next 7</p>
            </div>

            <div className="attendance-layout">
                <section className="attendance-list" aria-label="Classes">
                    {listStatus === "loading" && <p className="attendance-muted">Loading classes...</p>}
                    {listStatus !== "loading" && listStatus !== "ready" && (
                        <div className="attendance-alert" role="alert">
                            <span>{listStatus}</span>
                            <button type="button" onClick={loadClasses}>Try again</button>
                        </div>
                    )}
                    {listStatus === "ready" && classes.length === 0 && (
                        <p className="attendance-muted">No classes in this period.</p>
                    )}
                    {listStatus === "ready" && groups.map(group => (
                        <div key={group.label} className="attendance-group">
                            <h2 className="attendance-group-label">{group.label}</h2>
                            {group.items.map(item => {
                                const status = classStatus(item);
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`attendance-class ${item.id === selectedId ? "selected" : ""}`}
                                        onClick={() => setSelectedId(item.id)}
                                        aria-pressed={item.id === selectedId}
                                    >
                                        <span className="attendance-class-title">{item.title}</span>
                                        <span className="attendance-class-meta">{formatDay(item.class_date)} · {String(item.start_time).slice(0, 5)} · {item.trainer_name}</span>
                                        <span className={`attendance-chip ${status.tone}`}>{status.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </section>

                <section className="attendance-detail" aria-live="polite">
                    {!selectedId && listStatus === "ready" && (
                        <p className="attendance-muted">Choose a class to record attendance.</p>
                    )}
                    {detailStatus === "loading" && <p className="attendance-muted">Loading roster...</p>}
                    {detailStatus !== "loading" && detailStatus !== "ready" && detailStatus !== "idle" && (
                        <div className="attendance-alert" role="alert"><span>{detailStatus}</span></div>
                    )}
                    {detailStatus === "ready" && gymClass && (
                        <>
                            <div className="attendance-detail-header">
                                <div>
                                    <h2>{gymClass.title}</h2>
                                    <p className="attendance-muted">
                                        <CalendarDays size={14} /> {formatDay(gymClass.class_date)} · {String(gymClass.start_time).slice(0, 5)}–{String(gymClass.end_time).slice(0, 5)} · {gymClass.room}
                                    </p>
                                </div>
                                {canEdit && detail.roster.length > 0 && (
                                    <div className="attendance-bulk">
                                        <button type="button" onClick={() => markAll(true)}>All present</button>
                                        <button type="button" onClick={() => markAll(false)}>All absent</button>
                                    </div>
                                )}
                            </div>

                            {!canEdit && <p className="attendance-note">This class hasn't started yet. You can record attendance once it begins.</p>}

                            {detail.roster.length === 0 ? (
                                <p className="attendance-muted">Nobody is registered for this class.</p>
                            ) : (
                                <ul className="attendance-roster">
                                    {detail.roster.map(row => {
                                        const mark = marks[row.registration_id];
                                        return (
                                            <li key={row.registration_id}>
                                                <span className="attendance-name">{row.first_name} {row.last_name}</span>
                                                <div className="attendance-toggle" role="group" aria-label={`Attendance for ${row.first_name} ${row.last_name}`}>
                                                    <button type="button" className={mark === true ? "on present" : ""} aria-pressed={mark === true} disabled={!canEdit} onClick={() => setMark(row.registration_id, true)}>
                                                        <Check size={14} /> Present
                                                    </button>
                                                    <button type="button" className={mark === false ? "on absent" : ""} aria-pressed={mark === false} disabled={!canEdit} onClick={() => setMark(row.registration_id, false)}>
                                                        <X size={14} /> Absent
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {canEdit && detail.roster.length > 0 && (
                                <div className="attendance-footer">
                                    <span className="attendance-muted">
                                        {changed.length === 0 ? "No unsaved changes" : `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}`}
                                    </span>
                                    <button type="button" className="attendance-save" onClick={save} disabled={saving || changed.length === 0}>
                                        <ClipboardCheck size={16} /> {saving ? "Saving..." : "Save attendance"}
                                    </button>
                                </div>
                            )}
                            {message && <p className={`attendance-message ${message.tone}`} role="status">{message.text}</p>}
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

export default AttendancePage;
