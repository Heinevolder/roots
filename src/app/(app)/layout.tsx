import { BottomNav } from "@/components/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto max-w-xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28">{children}</main>
      <BottomNav />
    </>
  );
}
