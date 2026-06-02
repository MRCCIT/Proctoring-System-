/** In-memory per-session proctor state (phone streak, identity streak). */

const states = new Map();

export function getSessionProctorState(sessionId) {
  if (!states.has(sessionId)) {
    states.set(sessionId, {
      phoneStreak: 0,
      phoneActive: false,
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
