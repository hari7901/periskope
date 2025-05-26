// app/lib/types/periskope.ts
export interface Message {
  message_id: string;
  chat_id: string;
  message_type: string;
  body: string | null;
  from_me: boolean;
  timestamp: string;
  sender_phone: string;
  id?: {
    from_me: boolean;
    id: string;
    remote: string;
    serialized: string;
  };
  updated_at?: string;
  media?: {
    dimensions?: { ar: number; height: number; width: number };
    filename?: string;
    mimetype?: string;
    path?: string;
    size?: number;
    thumbnail?: string;
  };
  // Additional properties from chat response
  ack?: string;
  author?: string | null;
  broadcast?: boolean | null;
  broadcast_id?: string | null;
  delivery_info?: {
    delivered?: Record<string, number>;
    delivered_count?: number;
    pending?: string[];
    read?: Record<string, number>;
    read_count?: number;
  };
  device_type?: string | null;
  duration?: number | null;
  flag_metadata?: any | null;
  flag_response_time?: string | null;
  flag_status?: string | null;
  forwarding_score?: number | null;
  from?: string | null;
  fts?: string;
  has_media?: boolean | null;
  has_quoted_msg?: boolean | null;
  has_reaction?: boolean | null;
  invite_v4?: string | null;
  is_deleted?: boolean | null;
  is_ephemeral?: boolean | null;
  is_forwarded?: boolean | null;
  is_gif?: boolean | null;
  is_starred?: boolean | null;
  is_status?: boolean | null;
  links?: string[] | null;
  location?: any | null;
  media_key?: string | null;
  mentioned_ids?: string[];
  message_ticket_id?: string | null;
  order_id?: string | null;
  org_id?: string;
  org_phone?: string;
  performed_by?: string | null;
  poll_info?: any | null;
  poll_results?: any | null;
  prev_body?: string | null;
  quoted_message_id?: string | null;
  raw_data?: any | null;
  sent_message_id?: string | null;
  to?: string | null;
  token?: string | null;
  unique_id?: string;
  vcards?: any | null;
}

export interface MessageData {
  from: number;
  to: number;
  count: number;
  messages: Message[];
}

export interface ChatMember {
  chat_id: string;
  contact_color: string;
  contact_id: string;
  contact_image: string | null;
  contact_name: string;
  is_admin: boolean;
  is_internal: boolean;
  is_super_admin: boolean;
  org_id: string;
  org_phone: string;
}

export interface Chat {
  assigned_to: string | null;
  chat_access: Record<string, boolean> | null;
  chat_id: string;
  chat_image: string | null;
  chat_name: string;
  chat_org_phones: string[];
  chat_type: "user" | "group" | "business";
  closed_at: string | null;
  created_at: string;
  custom_properties: Record<string, any>;
  flag_count_map: any | null;
  group_description: string | null;
  hubspot_metadata: Record<string, any>;
  info_admins_only: boolean | null;
  invite_link: string | null;
  is_exited: boolean;
  is_muted: boolean;
  label_ids: Record<string, boolean>;
  latest_message: Message | null;
  member_add_mode?: string;
  member_count: number;
  message_unread_count: number | null;
  messages_admins_only: boolean | null;
  org_id: string;
  org_phone: string;
  updated_at: string;
  common_chats?: string[];
  members?: Record<string, ChatMember>;
}

export interface ChatsResponse {
  chats: Chat[];
  count: number;
  from: number;
  to: number;
}

export interface ChatMetrics {
  totalOpenChats: number;
  averageAgeInHours: number;
  maxAgeInHours: number;
  chatsWithDelayedResponse: number;
  openChatDetails: Array<{
    chatId: string;
    chatName: string;
    ageInHours: number;
    chatType?: string;
    agentPhone?: string | null;
    lastActivity?: string;
    ageCalculationMethod?: string; // How age was calculated
    isValidActivity?: boolean; // Whether this represents real activity
    memberCount?: number; // For groups/business chats
    isAssigned?: boolean; // Whether chat is assigned to an agent
  }>;
  delayedResponseDetails: Array<{
    chatId: string;
    chatName: string;
    chatType?: string;
    lastMessageTime: string;
    hoursWithoutResponse: number;
    agentPhone?: string | null;
    lastMessageFromCustomer?: boolean; // Whether last message was from customer
    memberCount?: number; // For groups/business chats
    reason?: string; // Why it's considered delayed
  }>;
  _debug?: {
    periskopePhone?: string;
    hasApiKey: boolean;
    totalChatsFound: number;
    openChatsOfTypeFound?: number;
    validActivityChats?: number; // Chats with valid activity timestamps
    chatTypeFilter?: string;
    agentPhonesChecked?: string[];
    chatTypeDistribution?: Record<string, number>;
    delayedResponseThresholds?: Record<string, any>; // Threshold logic for each chat type
    filterApplied?: string;
  };
}
