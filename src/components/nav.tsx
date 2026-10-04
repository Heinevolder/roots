"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Madplan", icon: CalendarIcon },
  { href: "/liste", label: "Liste", icon: ListIcon },
  { href: "/inspiration", label: "Inspiration", icon: SparkIcon },
  { href: "/opskrifter", label: "Opskrifter", icon: BookIcon },
  { href: "/mere", label: "Mere", icon: MoreIcon },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "text-accent" : "text-muted"}`}
              >
                <Icon />
                <span className={active ? "font-semibold" : ""}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const svg = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function CalendarIcon() {
  return (
    <svg {...svg}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg {...svg}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11" />
      <circle cx="5" cy="18" r="1" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg {...svg}>
      <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5z" />
      <path d="M18.5 15.5c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8z" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg {...svg}>
      <path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16z" />
      <path d="M5 16a3.5 3.5 0 0 1 3.5-3.5H19" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg {...svg}>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </svg>
  );
}
