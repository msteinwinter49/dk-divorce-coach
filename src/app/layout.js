import { AuthProvider } from "@/context/AuthContext";

export const metadata = {
  title: "DK Divorce Coach | Diana Kierein, CDC",
  description: "Certified Divorce Coaching helping separating parents navigate with clarity, cooperation, and a focus on protecting their kids.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: "system-ui, sans-serif" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
