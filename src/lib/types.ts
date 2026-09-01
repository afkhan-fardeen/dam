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

export type Tag = {
  id: string;
  name: string;
  created_at?: string | null;
};

export type Folder = {
  id: string;
  space_id: string;
  parent_folder_id: string | null;
  name: string;
  passcode_enabled?: boolean;
  description?: string | null;
  notes?: string | null;
  brand?: string | null;
  tags?: Tag[];
  created_by: string | null;
  created_at: string | null;
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
  brand?: string | null;
  created_by: string | null;
  uploaded_by: string | null;
  has_thumbnail: boolean | null;
  status: string | null;
  created_at: string | null;
  tags_text?: string | null;
  extracted_text?: string | null;
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
  brand?: string | null;
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

export type EntityType = {
  id: string;
  name: string;
  label: string;
  is_system: boolean;
  created_at: string | null;
};

export type Entity = {
  id: string;
  type_id: string;
  name: string;
  aliases: string[];
  description: string | null;
  status: string;
  merged_into_id: string | null;
  roles: string[];
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  entity_type?: EntityType | null;
  document_count?: number;
};

export type AssetEntity = {
  asset_id: string;
  entity_id: string;
  relation_label: string | null;
  created_at: string | null;
  entity?: Entity | null;
};

export type AttributeDef = {
  id: string;
  name: string;
  label: string;
  data_type: string;
  dropdown_options: string[] | null;
  applicable_space_kind: string | null;
  searchable: boolean;
  filterable: boolean;
  status: string;
  created_at: string | null;
};

export type AssetAttributeValue = {
  asset_id: string;
  attribute_def_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  attribute_def?: AttributeDef | null;
};

export type FsNodeType = "file" | "folder";

export type FsNode = {
  id: string;
  space_id: string;
  parent_id: string | null;
  node_type: FsNodeType;
  name: string;
  relative_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  content_hash: string | null;
  description: string | null;
  created_by: string | null;
  uploaded_by: string | null;
  has_thumbnail: boolean;
  passcode_enabled?: boolean;
  tags_text?: string | null;
  last_synced_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  tags?: Tag[];
  favorited?: boolean;
  locked?: boolean;
};

export type StorageStatus = {
  id: number;
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  storage_root: string;
  checked_at: string;
};

export function canEdit(role: SpaceRole | null, isAdmin: boolean): boolean {
  return isAdmin || role === "editor";
}

export function canDownload(role: SpaceRole | null, isAdmin: boolean): boolean {
  return isAdmin || role === "downloader" || role === "editor";
}
