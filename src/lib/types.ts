export type SpaceRole = "viewer" | "downloader" | "editor";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_admin: boolean;
  is_active?: boolean | null;
  created_at: string | null;
};

export type Space = {
  id: string;
  name: string;
  slug: string;
  color: string;
  kind?: string | null;
  requires_passcode?: boolean | null;
  status?: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type SpaceMembership = {
  id: string;
  space_id: string;
  user_id: string;
  role: SpaceRole;
  created_at: string | null;
};

export type Folder = {
  id: string;
  space_id: string;
  parent_folder_id: string | null;
  name: string;
  passcode_enabled?: boolean;
  created_by: string | null;
  created_at: string | null;
};

export type Tag = {
  id: string;
  name: string;
  created_at?: string | null;
};

export type Asset = {
  id: string;
  file_id: string;
  original_name: string | null;
  mime_type: string | null;
  size: number | null;
  space_id: string | null;
  folder_id: string | null;
  description: string | null;
  created_by: string | null;
  uploaded_by: string | null;
  has_thumbnail: boolean | null;
  status: string | null;
  created_at: string | null;
  tags_text?: string | null;
  tags?: Tag[];
  favorited?: boolean;
  locked?: boolean;
};

export type AssetInsert = {
  file_id: string;
  original_name: string;
  mime_type: string;
  size: number;
  space_id: string;
  folder_id: string | null;
  description: string | null;
  created_by: string | null;
  has_thumbnail: boolean;
  tags?: string[];
};

export type ActivityLog = {
  id: string;
  user_id: string | null;
  space_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
  summary?: string;
};

export function canEdit(role: SpaceRole | null, isAdmin: boolean): boolean {
  return isAdmin || role === "editor";
}

export function canDownload(role: SpaceRole | null, isAdmin: boolean): boolean {
  return isAdmin || role === "downloader" || role === "editor";
}
