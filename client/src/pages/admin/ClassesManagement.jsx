import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import apiRequest from "../../services/api";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import ActivityIcon from "../../components/ui/ActivityIcon";
import { ACTIVITY_NAMES, activityStyle, formatDay, formatTime } from "../../utils/activities";
import "./UsersManagement.css";

function ClassesManagement() {
    const [classes, setClasses] = useState([]);
    const [trainers, setTrainers] = useState([]);
    const [loadError, setLoadError] = useState("");
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({
        trainer_id: "",
        title: "",
        description: "",
        class_date: "",
        start_time: "",
        end_time: "",
        room: "",
        capacity: "",
        activity: "",
        intensity: ""
    });
    const [editingId, setEditingId] = useState(null);
    const [tab, setTab] = useState("upcoming");
    const confirm = useConfirm();
    const emptyForm = { trainer_id: "", title: "", description: "", class_date: "", start_time: "", end_time: "", room: "", capacity: "", activity: "", intensity: "" };

    useEffect(() => {
        loadClasses();
    }, []);

    async function loadClasses() {
        setLoading(true);
        setLoadError("");
        try {
            const [classData, trainerData] = await Promise.all([
                apiRequest("/classes/admin"),
                apiRequest("/trainers")
            ]);
            setClasses(classData);
            setTrainers(trainerData);
        } catch (error) {
            setLoadError(error.message || "Unable to load classes and trainers. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    function handleChange(e) {
        const { name, value } = e.target;
        setForm((p) => ({ ...p, [name]: value }));
    }

    async function handleSubmit(e) {
        e.preventDefault();

        try {
            if (editingId) {
                await apiRequest(`/classes/admin/${editingId}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        ...form,
                        capacity: Number(form.capacity)
                    })
                });
            } else {
                await apiRequest(`/classes/admin`, {
                    method: "POST",
                    body: JSON.stringify({
                        ...form,
                        capacity: Number(form.capacity)
                    })
                });
            }

            toast.success(editingId ? `${form.title} updated` : `${form.title} added to the schedule`);
            setForm(emptyForm);
            setEditingId(null);
            loadClasses();
        } catch (error) {
            toast.error(error.message || "Failed to save class");
        }
    }

    function handleEdit(cls) {
        setEditingId(cls.id);
        setForm({
            trainer_id: cls.trainer_id,
            title: cls.title,
            description: cls.description || "",
            class_date: cls.class_date,
            start_time: cls.start_time,
            end_time: cls.end_time,
            room: cls.room || "",
            capacity: cls.capacity || 0,
            activity: cls.activity || "",
            intensity: cls.intensity || ""
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function handleDelete(cls) {
        const ok = await confirm({ title: `Delete ${cls.title}?`, message: `${formatDay(cls.class_date)} at ${formatTime(cls.start_time)}. Classes with bookings can't be deleted.`, confirmLabel: "Delete class", danger: true });
        if (!ok) return;
        try {
            await apiRequest(`/classes/admin/${cls.id}`, { method: "DELETE" });
            toast.success("Class deleted");
            loadClasses();
        } catch (error) {
            toast.error(error.message || "Failed to delete class");
        }
    }

    function handleActivity(e) {
        const activity = e.target.value;
        setForm(p => ({ ...p, activity, title: p.title || activity }));
    }

    const shown = classes.filter(cls => tab === "upcoming" ? !cls.has_started : cls.has_started);
    const ordered = tab === "past" ? [...shown].reverse() : shown;

    return (
        <div className="users-management-page">
            <div className="users-management-panel">
                <h1 className="users-management-title">Classes Management</h1>

                <form onSubmit={handleSubmit} className="users-management-form">
                    <div className="admin-select-field">
                        <label htmlFor="class-trainer-select">Trainer</label>
                        <select id="class-trainer-select" name="trainer_id" value={form.trainer_id} onChange={handleChange} disabled={loading} required>
                            <option value="">Select a trainer</option>
                            {trainers.map(trainer => (
                                <option key={trainer.id} value={trainer.id}>
                                    {trainer.first_name} {trainer.last_name}{trainer.specialization ? ` — ${trainer.specialization}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="admin-select-field">
                        <label htmlFor="class-activity-select">Activity</label>
                        <select id="class-activity-select" name="activity" value={form.activity} onChange={handleActivity}>
                            <option value="">No activity type</option>
                            {ACTIVITY_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </div>
                    <div className="admin-select-field">
                        <label htmlFor="class-intensity-select">Intensity</label>
                        <select id="class-intensity-select" name="intensity" value={form.intensity} onChange={handleChange}>
                            <option value="">Not set</option>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                    <input name="title" value={form.title} onChange={handleChange} placeholder="Title" required />
                    <input name="class_date" value={form.class_date} onChange={handleChange} placeholder="Date (YYYY-MM-DD)" required />
                    <input name="start_time" value={form.start_time} onChange={handleChange} placeholder="Start Time (HH:MM)" required />
                    <input name="end_time" value={form.end_time} onChange={handleChange} placeholder="End Time (HH:MM)" required />
                    <input name="room" value={form.room} onChange={handleChange} placeholder="Room" />
                    <input name="capacity" type="number" value={form.capacity} onChange={handleChange} placeholder="Capacity" />
                    <textarea name="description" value={form.description} onChange={handleChange} placeholder="Description" />
                    <button type="submit" disabled={loading || Boolean(loadError) || trainers.length === 0}>{editingId ? "Save Changes" : "Add Class"}</button>
                    {editingId ? (
                        <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</button>
                    ) : null}
                </form>

                {loadError && (
                    <div role="alert" className="admin-load-error">
                        <p>{loadError}</p>
                        <button type="button" onClick={loadClasses}>Retry</button>
                    </div>
                )}
                {!loading && !loadError && trainers.length === 0 && <p>Add a trainer before creating a class.</p>}

                {loading ? (
                    <p>Loading classes...</p>
                ) : (
                    <>
                        <div className="admin-tabs" role="tablist" aria-label="Which classes">
                            <button type="button" role="tab" aria-selected={tab === "upcoming"} className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>
                                Upcoming <span>{classes.filter(c => !c.has_started).length}</span>
                            </button>
                            <button type="button" role="tab" aria-selected={tab === "past"} className={tab === "past" ? "active" : ""} onClick={() => setTab("past")}>
                                Past <span>{classes.filter(c => c.has_started).length}</span>
                            </button>
                        </div>
                        <div className="users-management-list">
                            {ordered.map((cls) => (
                                <div key={cls.id} className="users-management-card admin-class-card" style={{ "--accent": activityStyle(cls.activity).color }}>
                                    <div className="admin-class-head">
                                        <span className="admin-class-icon"><ActivityIcon name={cls.activity} size={18} /></span>
                                        <h3>{cls.title}</h3>
                                    </div>
                                    <p><strong>When:</strong> {formatDay(cls.class_date)}, {formatTime(cls.start_time)}–{formatTime(cls.end_time)}</p>
                                    <p><strong>Trainer:</strong> {cls.trainer_name}</p>
                                    <p><strong>Room:</strong> {cls.room || "–"}{cls.intensity ? ` · ${cls.intensity} intensity` : ""}</p>
                                    <p><strong>Capacity:</strong> {cls.capacity} <span className="admin-class-booked">({cls.registered_count} booked{cls.waitlist_count ? `, ${cls.waitlist_count} waiting` : ""})</span></p>
                                    <div className="users-management-actions">
                                        <button onClick={() => handleEdit(cls)}>Edit</button>
                                        <button onClick={() => handleDelete(cls)}>Delete</button>
                                    </div>
                                </div>
                            ))}
                            {ordered.length === 0 && <p>No {tab} classes.</p>}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default ClassesManagement;
