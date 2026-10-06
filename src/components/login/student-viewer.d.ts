export type MiguePose = 'neutral' | 'username' | 'password' | 'surprise' | 'wink';
export interface StudentController {
  setPose(pose: MiguePose): void;
  trackPointer(x: number, y: number): void;
  clearPointer(): void;
  dispose(): void;
}
export function createStudent(host: HTMLElement, options?: {
  onReady?: () => void;
  onError?: () => void;
}): StudentController;
