export type EvaluationType = 'simple' | 'complete' | 'premium';
export type Classification = 'approved' | 'warning' | 'reproved';
export type ItemStatus = 'ok' | 'attention' | 'problem' | 'original' | 'repaired' | 'compromised';

export interface ChecklistItem {
  category: string;
  item_name: string;
  status: ItemStatus;
  notes?: string;
  photos?: string[];
}

export interface Evaluation {
  id?: number;
  user_id: number;
  client_name: string;
  client_phone: string;
  brand: string;
  model: string;
  version: string;
  year_fab: number;
  year_model: number;
  km: number;
  plate: string;
  color?: string;
  chassis: string;
  city: string;
  evaluation_date: string;
  type: EvaluationType;
  final_classification: Classification;
  final_summary: string;
  photo_front?: string;
  photo_rear?: string;
  photo_side_right?: string;
  photo_side_left?: string;
  photo_dashboard?: string;
  photo_seats_front?: string;
  photo_seats_rear?: string;
  photo_trunk?: string;
  photos: string[];
  items?: ChecklistItem[];
  created_at?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  plan: string;
  role: 'admin' | 'inspector';
}

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  plan: string;
  role: 'admin' | 'inspector';
  active: number;
  created_at: string;
}
