export interface WorkspaceOverview {
  days: number; since: string; scope: "organization" | "assigned";
  newLeads: number; uniqueContacts: number; pendingCount: number;
  contactedRate: number | null; published: number; hasSeason: boolean;
  topListings: { id: string; name: string; status: string; viewCount: number; _count: { leads: number } }[];
  topContactListings: WorkspaceOverview["topListings"];
  upcomingBookings: { id: string; startDate: string; status: string; user: { name: string }; listing: { name: string } }[];
  pending: { id: string; status: string; user: { name: string }; listing: { name: string } }[];
  visits: { id: string; scheduledAt: string; lead: { id: string; user: { name: string }; listing: { name: string } } }[];
  trend: Record<string, number>;
}
export interface WorkspaceContacts {
  total: number; page: number; limit: number;
  items: { id: string; name: string; email: string; phone: string | null;
    leads: { id: string; status: string; listing: { id: string; name: string }; conversations: { id: string }[] }[];
  }[];
}
export interface WorkspaceMessage { id: string; isClosed: boolean; property: { name: string }; lead: { user: { name: string } } | null; messages: { content: string; createdAt: string }[] }
