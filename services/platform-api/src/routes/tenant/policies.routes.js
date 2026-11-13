import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';
import { isUuid } from '../../utils/validation.js';
import {
  listPolicyTemplates,
  listSessionTemplates,
  createSessionTemplate,
  updateSessionTemplate,
  deleteSessionTemplate,
} from '../../services/tenant/policyTemplates.js';

const policiesRouter = Router();
const sessionTemplatesRouter = Router();

function badId(res, label) {
  return res.status(400).type('application/problem+json').json(
    problemDetails({
      type: ProblemTypes.validation,
      title: 'Validation Error',
      status: 400,
      detail: `Invalid ${label} id`,
    })
  );
}

function handleError(res, e) {
  const status = e.status || 500;
  if (status === 404) {
    return res.status(404).type('application/problem+json').json(
      problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status, detail: e.message })
    );
  }
  if (status === 422) {
    return res.status(422).type('application/problem+json').json(
      problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status, detail: e.message })
    );
  }
  throw e;
}

policiesRouter.get('/', asyncHandler(async (req, res) => {
  const listed = await listPolicyTemplates(req.tenantContext.tenantId);
  res.json({
    data: listed.items,
    allowed_services: listed.allowed_services,
    feature_flags: listed.feature_flags,
  });
}));

function policyCrudForbidden(res) {
  return res.status(403).type('application/problem+json').json(
    problemDetails({
      type: ProblemTypes.forbidden,
      title: 'Forbidden',
      status: 403,
      detail: 'Proctoring policies are assigned by Super Admin and cannot be created or edited here.',
    })
  );
}

policiesRouter.post('/', asyncHandler(async (_req, res) => policyCrudForbidden(res)));

policiesRouter.patch('/:id', asyncHandler(async (_req, res) => policyCrudForbidden(res)));

policiesRouter.delete('/:id', asyncHandler(async (_req, res) => policyCrudForbidden(res)));

sessionTemplatesRouter.get('/', asyncHandler(async (req, res) => {
  const data = await listSessionTemplates(req.tenantContext.tenantId);
  res.json({ data });
}));

sessionTemplatesRouter.post('/', asyncHandler(async (req, res) => {
  try {
    const data = await createSessionTemplate(req.tenantContext.tenantId, req.body || {});
    res.status(201).json({ data });
  } catch (e) {
    handleError(res, e);
  }
}));

sessionTemplatesRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return badId(res, 'session-template');
  try {
    const data = await updateSessionTemplate(req.tenantContext.tenantId, req.params.id, req.body || {});
    res.json({ data });
  } catch (e) {
    handleError(res, e);
  }
}));

sessionTemplatesRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return badId(res, 'session-template');
  const ok = await deleteSessionTemplate(req.tenantContext.tenantId, req.params.id);
  if (!ok) {
    return res.status(404).type('application/problem+json').json(
      problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Session template not found' })
    );
  }
  res.status(204).end();
}));

export { policiesRouter, sessionTemplatesRouter };
