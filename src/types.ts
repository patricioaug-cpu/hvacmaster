export interface SelectedEquipment {
  brand: string;
  model: string;
  voltage: string;
  capacity: number;
  quantity: number;
  numFases?: string;
  pipeType?: string;
  notes?: string;
}

export interface InternalEquipment {
  type: string;
  power: number;
  quantity: number;
}

export interface Opening {
  width: number;
  height: number;
  type: 'janela_aberta' | 'vao_livre';
}

export interface Door {
  width: number;
  height: number;
  frequency: 'baixa' | 'media' | 'alta';
}

export interface CalculationData {
  type: 'residencial' | 'comercial' | 'escritorio' | 'loja';
  area: number;
  height: number;
  orientation: 'N' | 'S' | 'L' | 'O';
  wallType: 'simples' | 'dupla' | 'isolada';
  roofType: 'telha' | 'fibrocimento' | 'laje';
  glassType: 'simples' | 'duplo' | 'pelicula';
  glassPercentage: number;
  peopleCount: number;
  equipmentCount: number; // Keep for legacy
  internalEquipments?: InternalEquipment[];
  lightingType: 'led' | 'fluorescente' | 'incandescente';
  lightingPower: number;
  selectedEquipments?: SelectedEquipment[];
  airRenewal?: {
    enabled: boolean;
    flowRate: number;
    method: 'person' | 'area' | 'fixed';
  };
  usageHours: number;
  peopleTurnover: 'baixa' | 'media' | 'alta';
  insulationLevel: 'baixo' | 'medio' | 'alto';
  floorType: 'terra' | 'laje' | 'isolado';
  climateFactor: number;
  openings?: Opening[];
  doors?: Door[];
}

export interface CalculationResult {
  totalBTU: number;
  sensibleBTU: number;
  latentBTU: number;
  safetyMargin: number;
  recommendedRange: string;
  justification: string;
  calculationMemory: {
    baseLoad: number;
    orientFactor: number;
    peopleSensible: number;
    peopleLatent: number;
    equipLoad: number;
    lightLoad: number;
    glassGain: number;
    totalSensible: number;
    totalLatent: number;
    renewalSensible?: number;
    renewalLatent?: number;
    openingsSensible?: number;
    openingsLatent?: number;
    doorsSensible?: number;
    doorsLatent?: number;
  };
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  status: 'trial' | 'liberado' | 'bloqueado';
  trialStart: string;
  trialEnd: string;
  createdAt: string;
}
