import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listCandidates, bulkImportCandidates, parseCsvToCandidateRows } from '../../services/tenant/candidates.js';
import { problemDetails, ProblemTypes } from '../../utils/problemDetails.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { items, next_cursor } = await listCandidates(req.tenantContext.tenantId, {
      cursor: req.query.next_cursor,
      limit: req.query.limit,
    });
    res.json({ data: items, next_cursor });
  })
);

router.post(
  '/bulk-import',
  asyncHandler(async (req, res) => {
    let rowsInput = [];
    const body = req.body || {};
    if (Array.isArray(body.candidates)) {
      rowsInput = body.candidates;
    } else if (Array.isArray(body.rows)) {
      rowsInput = body.rows;
    } else if (typeof body.csv === 'string') {
      rowsInput = parseCsvToCandidateRows(body.csv);
    } else {
      return res.status(422).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.validation,
          title: 'Validation Error',
          status: 422,
          detail: 'Provide "candidates" array, "rows" array, or "csv" string field.',
        })
      );
    }
    const result = await bulkImportCandidates(req.tenantContext.tenantId, rowsInput);
    res.status(201).json({ data: result });
  })
);

export default router;
