# Reference assets

## Identity enrollment (`savej-reference.png`)

This photo is the **enrolled reference face** for the demo candidate:

- **Name:** Savej  
- **Email:** savej@demo.edu  
- **External ref:** `savej` (use this in the candidate exam app)

### Apply to the database

With Postgres running:

```bash
npm run db:seed
```

Seed reads `assets/savej-reference.png` (or `SEED_SAVEJ_IMAGE` in `.env`) and stores it for ArcFace matching.

### Test identity

1. Start backend: `npm run dev:backend` (API + AI on port 5055)  
2. Candidate app: `npm run dev:candidate` with **external ref `savej`**  
3. At identity check, your live camera must match **this** photo (similarity ≥ 62%).  
4. Someone else’s face should be **rejected**.

Replace `savej-reference.png` with any clear front-facing photo, then run `npm run db:seed` again.
