"use client";

import { Navbar } from "@/components/navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="app-backdrop" aria-hidden="true" />
      <Navbar />
      <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
