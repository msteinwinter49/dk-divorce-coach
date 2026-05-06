import { AuthProvider } from "@/context/AuthContext";

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata = {
  title: "DK Divorce Coach | Diana Kierein, CDC",
  description: "Certified Divorce Coaching helping separating parents navigate with clarity, cooperation, and a focus on protecting their kids.",
  verification: {
    google: "iBiyLbzDbvnhkG4JKYy5XhkyeR5eKFlSsxJwbglYfXc",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ overscrollBehavior: "none" }}>
      <head><style>{`html, body { overscroll-behavior: none; }`}</style></head>
      <body style={{ margin: 0, padding: 0, fontFamily: "system-ui, sans-serif", overscrollBehavior: "none", overflowX: "hidden" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
