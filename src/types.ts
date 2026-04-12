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
  equipmentCount: number;
  lightingType: 'led' | 'fluorescente' | 'incandescente';
  lightingPower: number;
  selectedEquipments?: SelectedEquipment[];
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
