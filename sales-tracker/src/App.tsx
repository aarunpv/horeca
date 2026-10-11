import React, { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { AdminDashboard } from "./AdminDashboard";
import { StaffCallingDashboard, ContactItem } from "./StaffCallingDashboard";
import { CallLogPayload } from "./ContactCallingCard";
import { HistoryItem } from "./CustomerHistoryDrawer";
import { SignInPage } from "./SignInPage";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "./useTheme";
import { supabase } from "./supabaseClient";
import { normalizeCallActionItem, normalizeCallOutcome } from "./callOptions";
import { writeEventLogs } from "./eventLogs";

interface UserProfile {
  id: string;
  name: string;
  role: "admin" | "staff";
  is_active: boolean;
}

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactItem[]>([]);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setIsAuthLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) setAppError(error.message);
      setSession(data.session);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null);
      setContacts([]);
      setIsProfileLoading(false);
      return;
    }

    let isMounted = true;
    setIsProfileLoading(true);
    setAppError(null);

    void supabase
      .from("profiles")
      .select("id, name, role, is_active")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setAppError(error.message);
          setProfile(null);
        } else if (data && (data.role === "admin" || data.role === "staff")) {
          setProfile(data as UserProfile);
        } else {
          setProfile(null);
        }
        setIsProfileLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const fetchContacts = async () => {
    if (!supabase) return;

    const rows: ContactItem[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, category, zone, address, phone_raw, phone_normalized, current_status, next_follow_up_at, assigned_to, google_rating, google_reviews")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = (data || []).map((contact) => ({
        ...contact,
        current_status: normalizeCallActionItem(contact.current_status),
      })) as ContactItem[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    setContacts(rows);
  };

  useEffect(() => {
    if (profile?.is_active && profile.role === "staff") {
      void fetchContacts().catch((error: unknown) =>
        setAppError(error instanceof Error ? error.message : "Contacts could not be loaded.")
      );
    } else {
      setContacts([]);
    }
  }, [profile?.id, profile?.is_active, profile?.role]);

  const handleSaveOutcome = async (payload: CallLogPayload) => {
    if (!supabase || !session) throw new Error("You must be signed in to save a call.");

    const { error } = await supabase.from("calls").insert({
      contact_id: payload.contactId,
      user_id: session.user.id,
      status: payload.status,
      action: payload.action || null,
      notes: payload.notes || null,
      follow_up_date: payload.followUpDate || null,
    });
    if (error) throw error;

    const { error: contactUpdateError } = await supabase
      .from("contacts")
      .update({
        current_status: payload.status,
        next_follow_up_at: payload.followUpDate || null,
      })
      .eq("id", payload.contactId);
    if (contactUpdateError) throw contactUpdateError;

    setContacts((currentContacts) =>
      currentContacts.map((contact) =>
        contact.id === payload.contactId
          ? {
              ...contact,
              current_status: payload.status,
              next_follow_up_at: payload.followUpDate || null,
            }
          : contact
      )
    );
  };

  const handleFetchHistory = async (contactId: string): Promise<HistoryItem[]> => {
    if (!supabase || !session) throw new Error("You must be signed in to view call history.");

    const [callsRes, auditRes] = await Promise.all([
      supabase.from("calls").select("*").eq("contact_id", contactId).order("called_at", { ascending: false }),
      supabase.from("activity_logs").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }),
    ]);
    if (callsRes.error) throw callsRes.error;
    if (auditRes.error) throw auditRes.error;

    const calls: HistoryItem[] = (callsRes.data || []).map((c: any) => ({
      id: c.id,
      type: "call",
      timestamp: c.called_at,
      userName: "Sales Rep",
      status: normalizeCallActionItem(c.status),
      action: normalizeCallOutcome(c.action) || undefined,
      notes: c.notes,
    }));

    const audits: HistoryItem[] = (auditRes.data || []).map((a: any) => ({
      id: a.id,
      type: "audit",
      timestamp: a.created_at,
      userName: "System",
      details: a.details,
    }));

    return [...calls, ...audits].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  const handleSignIn = async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    try {
      await writeEventLogs([{
        event_category: "audit",
        action: "auth.login",
        message: "User signed in.",
        details: { email: data.user.email || email },
      }]);
      setAppError(null);
      setAuthNotice(null);
    } catch (logError: unknown) {
      setAuthNotice(
        `Signed in, but login auditing is unavailable: ${logError instanceof Error ? logError.message : "Unknown logging error."}`
      );
    }
  };

  const handleSignUp = async (name: string, email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    if (!data.session) {
      throw new Error("Email confirmation is enabled in Supabase. Turn off Confirm email to sign up without verification.");
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    setAppError(null);
    let auditWarning: string | null = null;
    try {
      await writeEventLogs([{
        event_category: "audit",
        action: "auth.logout",
        message: "User initiated sign-out.",
        details: {
          name: profile?.name || "",
          email: session?.user.email || "",
        },
      }]);
    } catch (logError: unknown) {
      auditWarning =
        `You were signed out, but the logout audit could not be saved: ${logError instanceof Error ? logError.message : "Unknown logging error."}`;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAppError(error.message);
      return;
    }
    setAuthNotice(auditWarning);
  };

  if (!supabase) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <section className="max-w-lg bg-white border border-gray-200 rounded-xl p-6">
          <h1 className="text-lg font-bold text-gray-900">Sales tracker is not configured</h1>
          <p className="mt-2 text-sm text-gray-600">
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the project environment, then restart the app.
          </p>
        </section>
      </main>
    );
  }

  if (isAuthLoading) {
    return <main className="min-h-screen bg-gray-50 grid place-items-center text-sm text-gray-600">Loading...</main>;
  }

  if (!session) {
    return (
      <SignInPage
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        theme={theme}
        onToggleTheme={toggleTheme}
        notice={authNotice}
      />
    );
  }

  if (isProfileLoading) {
    return <main className="min-h-screen bg-gray-50 grid place-items-center text-sm text-gray-600">Loading profile...</main>;
  }

  if (!profile || !profile.is_active) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <section className="max-w-lg rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="text-lg font-bold text-gray-900">Account access is not set up</h1>
          <p className="mt-2 text-sm text-gray-600">
            Ask an administrator to add an active staff or admin profile for {session.user.email}.
          </p>
          {appError && <p role="alert" className="mt-3 text-sm text-red-700">{appError}</p>}
          <button onClick={handleSignOut} className="mt-5 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="min-w-0 w-full overflow-x-clip">
      <nav className="flex min-w-0 flex-wrap items-center justify-between gap-2 bg-gray-900 px-3 py-2 text-[11px] text-white sm:px-4 sm:text-xs">
        <span className="min-w-0 font-bold tracking-wide">{profile.role === "admin" ? "ADMIN" : "STAFF"} · SALES CALL TRACKER</span>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline text-gray-300">{profile.name || session.user.email}</span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} darkHeader />
          <button onClick={handleSignOut} className="min-h-10 rounded bg-gray-700 px-3 py-2 font-semibold hover:bg-gray-600">
            Sign out
          </button>
        </div>
      </nav>

      {authNotice && (
        <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
          {authNotice}
        </div>
      )}

      {appError && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {appError}
        </div>
      )}

      {profile.role === "admin" ? (
        <AdminDashboard />
      ) : (
        <StaffCallingDashboard
          contacts={contacts}
          staffId={session.user.id}
          onSaveOutcome={handleSaveOutcome}
          onFetchHistory={handleFetchHistory}
        />
      )}
    </div>
  );
};