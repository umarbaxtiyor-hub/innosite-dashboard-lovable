import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Kirish — QurilishNazorat" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  // Ichki: username → email (Supabase email talab qiladi, foydalanuvchidan yashiramiz).
  // Bot tomonidan yaratilgan foydalanuvchilarda login "ism.1234" ko'rinishida bo'ladi —
  // shuning uchun agar kiritilgan qiymatda "." yoki "@" bo'lsa, uni o'zgartirmasdan ishlatamiz.
  const toEmail = (u: string) => {
    const raw = u.trim().toLowerCase();
    if (raw.includes("@")) return raw;
    const cleaned = raw.replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
    return `${cleaned}@tizim.local`;
  };
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionEmail(session?.user?.email ?? null);
      if (session?.user) checkRole(session.user.id);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user?.email ?? null);
      if (data.session?.user) checkRole(data.session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function checkRole(uid: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const roles = (data ?? []).map((r) => r.role).join(", ");
    setRole(roles || "—");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const emailFromName = toEmail(mode === "signup" ? fullName : username);
      if (emailFromName.length < 5) {
        throw new Error("Ism kamida 2 harf bo'lsin");
      }
      const finalPassword = /^\d{4}$/.test(password) ? `pin${password}` : password;
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: emailFromName,
          password: finalPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName, username: emailFromName.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Ro'yxatdan o'tdingiz!");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: emailFromName, password: finalPassword });
        if (error) throw error;
        toast.success("Tizimga kirdingiz");
        navigate({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Xatolik");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setRole(null);
    toast.success("Chiqdingiz");
  }

  if (sessionEmail) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Tizimga kirgansiz</h2>
          </div>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Email:</span> <b>{sessionEmail}</b></div>
            <div><span className="text-muted-foreground">Rollar:</span> <b>{role ?? "..."}</b></div>
          </div>
          <div className="flex gap-2">
            <Button asChild className="flex-1"><Link to="/">Bosh sahifa</Link></Button>
            <Button variant="outline" onClick={handleLogout}>Chiqish</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <Card className="space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">{mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" ? (
            <div>
              <Label>Ism va familya</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          ) : (
            <div>
              <Label>Login yoki ism</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
          )}
          <div>
            <Label>Parol</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} required />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Hisobingiz yo'qmi? Ro'yxatdan o'tish faqat @Finance_tizim_bot orqali — admin tasdiqlagach PIN beriladi.
        </p>
      </Card>
    </div>
  );
}
