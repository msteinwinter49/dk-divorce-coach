"use client";
import { useState, useEffect } from "react";
import { C, S } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function Documents() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase.from("documents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setDocs(data || []);
        setLoading(false);
      });
  }, [user]);

  const handleDownload = async (doc) => {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 60);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl);
    }
  };

  const tagColor = t => t === "Resource" ? { bg: C.tealLight, color: C.teal } : t === "Notes" ? { bg: C.purpleLight, color: C.purple } : { bg: C.warm, color: C.muted };

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>Documents</h1>
      <p style={S.p}>Files shared by Diana appear here. Click any file to download.</p>
      {loading ? (
        <p style={{ ...S.p, textAlign: "center" }}>Loading documents...</p>
      ) : docs.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", color: C.hint }}>No documents shared yet.</div>
      ) : (
        docs.map(d => {
          const tc = tagColor(d.tag);
          return (
            <div key={d.id} style={{ ...S.card, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", gap:12 }} onClick={() => handleDownload(d)}>
              <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                <div style={{ width:36, height:36, borderRadius:8, background:C.warm, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:500, color:C.muted, flexShrink:0 }}>PDF</div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
                  <div style={{ fontSize:12, color:C.hint, marginTop:2 }}>{new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
              </div>
              {d.tag && <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:tc.bg, color:tc.color, fontWeight:500, flexShrink:0 }}>{d.tag}</span>}
            </div>
          );
        })
      )}
    </div>
  );
}
