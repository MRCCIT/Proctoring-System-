/**
 * RFC 7807 Problem Details
 * @see https://www.rfc-editor.org/rfc/rfc7807
 */
export function problemDetails({
  type = 'about:blank',
  title,
  status,
  detail,
  instance,
  extensions = {},
}) {
  return {
    type,
    title,
    status,
    ...(detail !== undefined ? { detail } : {}),
    ...(instance !== undefined ? { instance } : {}),
    ...extensions,
  };
}

export const ProblemTypes = {
  validation: 'https://api.proctorshield.io/problems/validation-error',
  unauthorized: 'https://api.proctorshield.io/problems/unauthorized',
  forbidden: 'https://api.proctorshield.io/problems/forbidden',
  notFound: 'https://api.proctorshield.io/problems/not-found',
  conflict: 'https://api.proctorshield.io/problems/conflict',
  internal: 'https://api.proctorshield.io/problems/internal-error',
  serviceUnavailable:
    'https://api.proctorshield.io/problems/service-unavailable',
};
