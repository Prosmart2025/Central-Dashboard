export interface TuyaFunction {
  code: string;
  type?: string;
  name?: string;
  values?: string | Record<string, unknown>;
}
export interface TuyaSpecification {
  functions?: TuyaFunction[];
  status?: TuyaFunction[];
}
export interface CurtainMotor {
  id: string;
  label: string;
  controlCode?: string;
  positionCode?: string;
  position?: number;
  state?: string;
  inverted?: boolean;
  calibrated?: boolean;
  canOpen: boolean;
  canClose: boolean;
  canStop: boolean;
  canPosition: boolean;
}
export interface InfraredKey {
  key: string;
  key_id?: number;
  key_name?: string;
  standard_key?: boolean;
}
export interface InfraredBinding {
  hubId: string;
  remoteId: string;
  categoryId: number;
  remoteIndex?: number;
  brandName?: string;
  brandId?: number;
  singleAir?: boolean;
  duplicatePower?: boolean;
  definitionVersion?: number;
  checkedAt?: string;
  keys: InfraredKey[];
  available: boolean;
  error?: string;
  keyRange?: Array<{ mode: number; temp_list?: Array<{ temp: number | null; fan_list?: Array<{ fan: number }> }> }>;
}
export interface DeviceIntegration {
  source: "smartlife" | "developer" | "home-assistant" | "demo" | "manual";
  hidden?: boolean;
  hiddenAt?: string;
  cardSize?: "standard" | "wide" | "large";
  accountPresent?: boolean;
  category?: string;
  homeId?: string;
  homeName?: string;
  roomId?: string;
  roomSynced?: boolean;
  roomInheritedFromHub?: boolean;
  roomOverride?: boolean;
  layoutOverride?: boolean;
  functions?: TuyaFunction[];
  functionsFetchedAt?: string;
  statusSchema?: TuyaFunction[];
  channelNames?: Record<string, string>;
  tuyaChannelNames?: Record<string, string>;
  channelNamesSyncedAt?: string;
  channelNamesError?: string;
  irControlMode?: "direct" | "scenes" | "home-assistant";
  homeAssistantEntityId?: string;
  provider?: string;
  manufacturer?: string;
  model?: string;
  areaId?: string;
  entityDomain?: string;
  sceneBindings?: Array<{ request: Record<string, unknown>; sceneId: string }>;
  reported?: Record<string, unknown>;
  syncedAt?: string;
  capabilityError?: string;
  infrared?: InfraredBinding;
  linkedRemotes?: Array<{ id: string; name: string }>;
  sceneIds?: string[];
  irLastAccepted?: { state: Record<string,unknown>; at: string };
  command?: {
    id?: string;
    status: "accepted" | "confirmed" | "unconfirmed" | "failed";
    message: string;
    at: string;
    provider: string;
    code?: string;
    durationMs?: number;
    requested?: Record<string, unknown>;
    commands?: Array<{ code: string; value: unknown }>;
    ir?: { path: string; body: Record<string,unknown>; hubId:string; remoteId:string; remoteIndex?:number; profileVerifiedAt?:string };
  };
}
export interface RoomIntegration {
  source: "smartlife" | "home-assistant" | "demo" | "manual";
  homeId?: string;
  homeName?: string;
  roomId?: string;
}
export interface SceneIntegration {
  source: "smartlife" | "home-assistant" | "demo" | "manual";
  homeId?: string;
  sceneId?: string;
  homeAssistantEntityId?: string;
  deviceIds?: string[];
  enabled?: boolean;
}
export interface DeviceCommandResult {
  ok: boolean;
  message: string;
}
