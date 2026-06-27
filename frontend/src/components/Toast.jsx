import React from "react";

const icons = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
};

export default function Toast({ toast }) {
  return (
    <div className={`toast toast--${toast.type}`} key={toast.id}>
      <span className="toast__icon">{icons[toast.type] || "ℹ️"}</span>
      <span className="toast__message">{toast.message}</span>
    </div>
  );
}
