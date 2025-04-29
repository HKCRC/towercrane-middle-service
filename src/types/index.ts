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
