/** In-memory per-session proctor state (device and identity streaks). */

const states = new Map();

export function getSessionProctorState(sessionId) {
  if (!states.has(sessionId)) {
    states.set(sessionId, {
      phoneStreak: 0,
      phoneActive: false,
      electronicsStreak: 0,
      electronicsActive: false,
      identityMismatchStreak: 0,
      lastTickAt: 0,
      tickCount: 0,
    });
  }
  return states.get(sessionId);
}

export function clearSessionProctorState(sessionId) {
  states.delete(sessionId);
}

export function clearAllSessionProctorState() {
  states.clear();
}
