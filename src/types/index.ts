export type StateUser = {
  aud: string;
  phoneNumber: string;
  exp: number;
  iat: number;
  userId: string;
};

export enum AlgorithmStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
}

export enum AlgorithmType {
  FLAT_TOWER_CRANE = '1',
  DYNAMIC_TOWER_CRANE = '2',
}

export type AlgorithmInfoType = {
  name: string;
  description: string;
  map_name: string;
  status?: AlgorithmStatus;
  center_point: string;
  algorithm_type: AlgorithmType;
  algorithm_id: string;
};
