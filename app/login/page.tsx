"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // depending on settings, user may need to confirm email
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Link href="/">
            <Image
              src="/fit2play_logo_canva.png"
              alt="Fit2Play"
              width={260}
              height={100}
              className="h-12 w-auto"
              priority
            />
          </Link>
          <p className="text-xs text-slate-500">Return-to-sport intelligence platform</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold mb-4 text-slate-900">
            {mode === "login" ? "Log in" : "Create account"}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-700 mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded-md bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-lime-500 focus:outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm text-slate-700 mb-1">Password</label>
              <input
                type="password"
                className="w-full rounded-md bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-lime-500 focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-lime-400 text-slate-950 font-semibold py-2 text-sm hover:brightness-110 disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Log in"
                : "Sign up"}
            </button>
          </form>

          <button
            className="mt-4 text-xs text-slate-500 hover:text-lime-700"
            onClick={() =>
              setMode((m) => (m === "login" ? "signup" : "login"))
            }
          >
            {mode === "login"
              ? "Need an account? Sign up"
              : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}