"use client";
import { useRouter } from "next/navigation";
import LegalLayout from "@/components/LegalLayout";
import TermsPage from "@/components/TermsPage";

export default function Page() {
  const router = useRouter();
  const setPage = (p) => {
    if (p === "Home") router.push("/");
    else if (p === "Privacy") router.push("/privacy");
    else if (p === "Terms") router.push("/terms");
    else router.push("/");
  };
  return (
    <LegalLayout>
      <TermsPage setPage={setPage} />
    </LegalLayout>
  );
}
