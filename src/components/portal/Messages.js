"use client";
import { useState, useEffect, useRef } from "react";
import { C, S } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function Messages({ viewAsClient }) {
  const { user } = useAuth();
  const targetId = viewAsClient?.id || user?.id;
  const readOnly = !!viewAsClient;
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!targetId) return;
    const supabase = createClient();
    const conversationId = targetId;

    supabase.from("messages")
      .select("*, sender:profiles(full_name, role)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMsgs(data || []);
        setLoading(false);
      });

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        const { data } = await supabase.from("messages")
          .select("*, sender:profiles(full_name, role)")
          .eq("id", payload.new.id)
          .single();
        if (data) setMsgs(prev => [...prev, data]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [targetId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = async () => {
    if (!draft.trim()) return;
    const supabase = createClient();
    const text = draft;
    setDraft("");
    await supabase.from("messages").insert({
      conversation_id: user.id,
      sender_id: user.id,
      content: text,
    });
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div style={S.page}>
      <h1 style={{...S.h1, fontSize:26}}>Messages</h1>
      <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
        <div style={{ padding:"1rem 1.25rem", borderBottom:`0.5px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:C.tealLight, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:500, color:C.teal, flexShrink:0 }}>DK</div>
          <div>
            <div style={{ fontSize:14, fontWeight:500 }}>Diana Kierein, CDC</div>
            <div style={{ fontSize:12, color:C.teal }}>Your coach</div>
          </div>
        </div>
        <div style={{ padding:"1.25rem", minHeight:260, display:"flex", flexDirection:"column", gap:12 }}>
          {loading ? (
            <p style={{ ...S.p, textAlign: "center" }}>Loading messages...</p>
          ) : msgs.length === 0 ? (
            <p style={{ ...S.p, textAlign: "center", color: C.hint }}>No messages yet. Say hello!</p>
          ) : (
            msgs.map((m) => {
              const isMe = m.sender_id === targetId;
              const senderName = isMe ? "You" : (m.sender?.full_name || "Diana");
              return (
                <div key={m.id} style={{ display:"flex", flexDirection:"column", alignItems:isMe?"flex-end":"flex-start" }}>
                  <div style={{ maxWidth:"85%", padding:"10px 14px", borderRadius:12, fontSize:14, lineHeight:1.6,
                    background:isMe?C.teal:C.warm,
                    color:isMe?"#fff":C.text }}>
                    {m.content}
                  </div>
                  <span style={{ fontSize:11, color:C.hint, marginTop:4 }}>{senderName} · {formatTime(m.created_at)}</span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
        {readOnly ? (
          <div style={{ padding:"10px 1.25rem", borderTop:`0.5px solid ${C.border}`, fontSize:13, color:C.hint, textAlign:"center" }}>
            Read-only view — messages cannot be sent
          </div>
        ) : (
          <div style={{ padding:"1rem", borderTop:`0.5px solid ${C.border}`, display:"flex", gap:10 }}>
            <input style={{...S.input, marginBottom:0, flex:1}} placeholder="Write a message\u2026" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} />
            <button style={S.btn} onClick={send}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
