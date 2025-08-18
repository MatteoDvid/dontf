export type TagId =
  | 'GEAR_BACKPACK_DAYPACK'
  | 'GEAR_UNIVERSAL_ADAPTER'
  | 'GEAR_POWER_BANK'
  | 'GEAR_TRAVEL_BOTTLES'
  | 'GEAR_RAIN_PONCHO'
  | 'CLOTHING_THERMAL_LAYER'
  | 'ESSENTIALS_DOCUMENT_POUCH'
  | 'RISK_FIRST_AID_KIT'
  | 'RISK_ANTI_THEFT_LOCK'
  | 'RISK_MOSQUITO_REPELLENT';

export type CategoryId = 'gear-category' | 'clothing' | 'essentials' | 'risk-safety';

export const TAG_CATEGORY: Record<TagId, CategoryId> = {
  GEAR_BACKPACK_DAYPACK: 'gear-category',
  GEAR_UNIVERSAL_ADAPTER: 'gear-category',
  GEAR_POWER_BANK: 'gear-category',
  GEAR_TRAVEL_BOTTLES: 'gear-category',
  GEAR_RAIN_PONCHO: 'gear-category',
  CLOTHING_THERMAL_LAYER: 'clothing',
  ESSENTIALS_DOCUMENT_POUCH: 'essentials',
  RISK_FIRST_AID_KIT: 'risk-safety',
  RISK_ANTI_THEFT_LOCK: 'risk-safety',
  RISK_MOSQUITO_REPELLENT: 'risk-safety',
};

export const ALL_TAGS: TagId[] = Object.keys(TAG_CATEGORY) as TagId[];

export const PROMPT_VERSION = 'v0';
