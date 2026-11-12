import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import "./ConfirmDialog.css";

const ConfirmContext = createContext(null);

// Usage: const confirm = useConfirm(); if (await confirm({ title, message, confirmLabel, danger })) { ... }
export function ConfirmProvider({ children }) {
    const [request, setRequest] = useState(null);
    const confirmButton = useRef(null);

    const confirm = useCallback(options => new Promise(resolve => setRequest({ ...options, resolve })), []);

    function close(result) {
        request?.resolve(result);
        setRequest(null);
    }

    useEffect(() => {
        if (!request) return undefined;
        confirmButton.current?.focus();
        const onKey = event => { if (event.key === "Escape") close(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {request && (
                <div className="confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(false); }}>
                    <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
                        <h2 id="confirm-title">{request.title}</h2>
                        {request.message && <p id="confirm-message">{request.message}</p>}
                        <div className="confirm-actions">
                            <button type="button" className="confirm-cancel" onClick={() => close(false)}>{request.cancelLabel || "Keep it"}</button>
                            <button type="button" ref={confirmButton} className={`confirm-ok ${request.danger ? "danger" : ""}`} onClick={() => close(true)}>
                                {request.confirmLabel || "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
    return useContext(ConfirmContext);
}
