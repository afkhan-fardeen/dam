"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconFolderFilled,
  IconUsers,
  IconTags,
  IconActivity,
  IconAffiliate,
  IconListDetails,
} from "@tabler/icons-react";

const TABS = [
  {
    href: "/admin/spaces",
    label: "Spaces",
    icon: IconFolderFilled,
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: IconUsers,
  },
  {
    href: "/admin/tags",
    label: "Tags",
    icon: IconTags,
  },
  {
    href: "/admin/entities",
    label: "Entities",
    icon: IconAffiliate,
  },
  {
    href: "/admin/attributes",
    label: "Attributes",
    icon: IconListDetails,
  },
  {
    href: "/admin/activity",
    label: "Activity",
    icon: IconActivity,
  },
] as const;

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div role="tablist" className="tabs tabs-border mb-6 overflow-x-auto">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            className={`tab gap-2 ${active ? "tab-active" : ""}`}
          >
            <Icon size={14} stroke={1.75} className="text-primary" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
