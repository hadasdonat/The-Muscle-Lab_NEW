import { useState } from "react";
import toast from "react-hot-toast";
import { cancelClassRegistration, joinWaitlist, leaveWaitlist, registerToClass } from "../services/api";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { formatDay, formatTime } from "../utils/activities";

// Booking actions shared by the classes page and the calendar.
function useClassBooking(reload) {
    const confirm = useConfirm();
    const [busyId, setBusyId] = useState(null);

    async function run(id, action, success) {
        setBusyId(id);
        try {
            const result = await action();
            toast.success(typeof success === "function" ? success(result) : success);
            await reload();
        } catch (error) {
            toast.error(error.message || "Something went wrong. Try again.");
        } finally {
            setBusyId(null);
        }
    }

    return {
        busyId,
        onRegister: c => run(c.id, () => registerToClass(c.id), `Booked: ${c.title}, ${formatDay(c.class_date)} at ${formatTime(c.start_time)}`),
        onCancel: async c => {
            const ok = await confirm({
                title: `Cancel ${c.title}?`,
                message: `${formatDay(c.class_date)} at ${formatTime(c.start_time)} with ${c.trainer_name}. If someone is on the waitlist, they'll get your place.`,
                confirmLabel: "Cancel booking",
                danger: true
            });
            if (ok) run(c.id, () => cancelClassRegistration(c.id), "Booking cancelled");
        },
        onJoinWaitlist: c => run(c.id, () => joinWaitlist(c.id), result => `You're #${result.position} on the waitlist. We'll book you automatically if a place opens.`),
        onLeaveWaitlist: c => run(c.id, () => leaveWaitlist(c.id), "You left the waitlist")
    };
}

export default useClassBooking;
