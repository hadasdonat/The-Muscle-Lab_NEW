import { Toaster } from "react-hot-toast";
import AppRoutes from "./routes/AppRoutes";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";

function App() {
  return (
    <ConfirmProvider>
      <AppRoutes />
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 3500,
          style: {
            background: "#1e1e1e",
            color: "#f5f5f5",
            border: "1px solid #2a2a2a",
            borderRadius: "14px",
            padding: "12px 16px",
            fontSize: "14px",
            boxShadow: "0 12px 40px rgba(0,0,0,.45)"
          },
          success: { iconTheme: { primary: "#FFD400", secondary: "#111" } },
          error: { iconTheme: { primary: "#EF4444", secondary: "#fff" } }
        }}
      />
    </ConfirmProvider>
  );
}

export default App;
