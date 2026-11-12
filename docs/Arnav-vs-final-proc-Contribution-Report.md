# Contribution Report — Arnav Branch vs `final-proc`

**Date:** August 17, 2026  
**Compared branches:** `Arnav` (`aeab0e3`) vs `final-proc` (`26ca11f`)  
**Reference:** *Technical Specification — AI-Based Remote Proctoring System Architecture* (PDF)  
**Repo:** [MRCCIT/Proctoring-System-](https://github.com/MRCCIT/Proctoring-System-.git)

---

## 1. Executive summary

Arnav’s work is concentrated in **AI monitoring quality** and **exam lockdown hardening**, not in rewriting the platform stack. Against the PDF’s **AI Monitoring Module** and **Lockdown Browser** sections, he delivered measurable progress on:

1. Custom **electronics / tablet YOLO** (train → evaluate → runtime dual detector)  
2. **Face-count evaluation** on FDDB (tuning MediaPipe BlazeFace)  
3. **Window focus** and **multiple-display** lockdown signals  

He did **not** implement the PDF’s Azure / Firebase / ASP.NET / Twilio stack — that is outside ProctorShield’s Node + Postgres architecture. His learning curve is best scored on **AI event coverage** and **secure-exam signals**, not cloud re-platforming.

| Area | Verdict |
|------|---------|
| Overall assigned AI/lockdown contribution | **Strong / mostly complete** for model + lockdown signals |
| Production polish (FP rates, defaults, UI copy) | **Partial** — needed follow-up hardening |
| PDF cloud stack (Azure, Firebase, Twilio) | **N/A** — not this codebase’s target architecture |

---

## 2. What `final-proc` already had (baseline)

Before Arnav’s branch, `final-proc` already included:

| Capability | Status on `final-proc` |
|------------|-------------------------|
| Candidate exam app + SDK | Present |
| Tenant / super admin portals | Present |
| Node `platform-api` + Postgres | Present |
| Python AI sidecar (MediaPipe face/gaze, YOLO phone, ArcFace identity) | Present |
| Chunked camera/screen recording | Present |
| Basic lockdown (shortcuts, visibility, capture block) | Present |
| Custom electronics YOLO | **Absent** |
| FDDB face-count eval tooling | **Absent** |
| Dedicated window-focus monitor + multi-display check | **Absent** |

---

## 3. What Arnav added (confirmed from git diff)

Meaningful code/model delta (`final-proc` → `Arnav`), excluding `.next` / storage noise:

**~1,400+ lines** across ~32 product files, plus model binaries.

### 3.1 Model optimization — electronics YOLO (primary unique deliverable)

| Deliverable | Evidence |
|-------------|----------|
| Trained custom YOLO11n fine-tune | `python/models/electronics_yolo.pt` (matches train `best.pt`) |
| Classes | Smart Phone, Tablet, Tablet-and-Smart-phone, iPad |
| Training scripts | `python/training/train_electronics.py`, `evaluate_electronics.py`, `infer_both_models.py`, `electronics_dataset.yaml`, `README.md` |
| Reported best val (epoch 37) | **mAP50 ≈ 0.916**, P≈0.95, R≈0.65 (49 val images) |
| Runtime integration | `ElectronicsDetector` in `identity.py`; wired in `session_analyzer.py`, `run_ai_server.py` |
| API / Node state | `electronics_*` fields in tick payload + `sessionProctorState` / `unifiedProctorAnalyze` / persistence captions |
| SDK types | Electronics fields on `ServerAiAnalysis`; violation alert label |

**Optimization quality notes**

- Tablet class is strong (P≈0.91, R≈0.96).  
- Val set is **small (49 images)** — metrics look optimistic; Smart Phone class had **0 recall** in the reported excerpt (phones correctly left to COCO `yolo11n`).  
- Original Arnav runtime defaults were heavy (`imgsz=640`, `max_dim=960`, `frame_skip=1`, streak=1) — high dual-YOLO cost and FP risk; later hardened (conf↑, skip↑, streak≥2, off-by-default).

### 3.2 Face / multi-face learning curve (FDDB)

| Deliverable | Evidence |
|-------------|----------|
| FDDB evaluation tool | `python/tools/eval_fddb.py` |
| Experiment notes | `python/tools/findings.md` |
| BlazeFace TFLite asset | `python/models/blaze_face_full_range.tflite` |
| Analyzer retune | MediaPipe `model_selection` / confidence experiments |

**Key learning results (from his findings)**

| Setting | Exact count accuracy | Overcount | Undercount |
|---------|----------------------|-----------|------------|
| model=0, conf=0.6 | 80.5% | 97 | 457 |
| model=1, conf=0.5 | **90.7%** | 26 | 216 |
| model=1, conf=0.4 | 91.3% | 57 | 168 |

He correctly identified that **full-range + lower conf** improves FDDB exact-count accuracy, but production still needed **IoU NMS + streak** because raw BlazeFace duplicate boxes caused false multi-face alerts on single candidates.

### 3.3 Lockdown / exam security (maps to PDF Lockdown Browser)

| Feature | File | Status |
|---------|------|--------|
| Window focus / blur monitor | `WindowFocusMonitor.ts` + `LockdownEnforcer` | **Completed** |
| Multiple monitors (`screen.isExtended`) | Poll every 30s → `multiple_displays_detected` | **Completed** |
| Tab hide / shortcuts / capture block | Pre-existing + retained | Baseline |

### 3.4 Other

| Item | Notes |
|------|--------|
| Stop tracking large recordings/dataset | Commit `d19715a` — good hygiene |
| Gaze / face_match small resilience tweaks | Minor |
| `tqdm` in requirements | Training convenience |

---

## 4. Mapping to the Technical Specification PDF

The PDF defines an **Azure + Firebase + ASP.NET + Twilio** architecture. ProctorShield implements the **same functional goals** on **Node/Postgres/local AI**. Scoring below is against **functional modules (§13)** and **AI events (§4.1)**, not Azure reimplementation.

### 4.1 AI events captured (§4.1 / §13.3)

| Spec requirement | On `final-proc` | Arnav contribution | Completion |
|------------------|-----------------|--------------------|------------|
| Face detection | Yes (MediaPipe) | FDDB eval + analyzer tuning | **Completed** (+ eval depth) |
| Multiple face detection | Yes (raw count) | Eval + later NMS/streak hardening path | **Completed with caveats** |
| Audio / noise | Yes (`AudioAnalyzer`) | None | Baseline (not Arnav) |
| Browser / tab switching | Yes (`VisibilityMonitor`) | Kept | Baseline |
| Window focus loss | Partial / inline | Dedicated `WindowFocusMonitor` | **Completed by Arnav** |
| Device change / multi-monitor | No | `screen.isExtended` polling | **Completed by Arnav** |
| Connectivity interruptions | Partial (network monitor) | None notable | Baseline |
| Prohibited electronics (tablet/iPad) | Phone YOLO only | Custom electronics YOLO + dual detector | **Completed by Arnav** (beyond PDF wording) |

### 4.2 Lockdown browser features (§4.2)

| Spec feature | Status | Owner |
|--------------|--------|-------|
| Disable tab switching / visibility | Done | Baseline |
| Restrict copy/paste / shortcuts | Done | Baseline |
| Restrict screen capture | Done | Baseline |
| Restrict browser navigation / fullscreen | Done | Baseline |
| Monitor candidate activities (focus, displays) | **Improved** | **Arnav** |

### 4.3 Admin / storage / cloud (§8–§9)

| Spec item | ProctorShield status | Arnav |
|-----------|----------------------|-------|
| Admin violation / evidence review | Tenant portal exists | Captions for electronics |
| Blob / cloud media (Azure Blob) | Local `storage/` (S3 path scaffolded elsewhere) | Not his scope |
| Firebase realtime | Not used | N/A |
| Twilio TURN | Optional / config only | N/A |

**Conclusion vs PDF:** Arnav completed the **AI monitoring + lockdown signal** slice of the learning assignment. He did **not** own cloud migration items in the PDF.

---

## 5. Optimization depth — honest assessment

### What he did well

1. End-to-end custom model loop: dataset YAML → train → val metrics → deploy weight → sidecar + Node tick.  
2. Documented FDDB experiments with quantitative accuracy tables.  
3. Dual-detector design (COCO phone + custom tablet/iPad) is architecturally sound.  
4. Added real lockdown signals called out in competitor notes (Talview-style: focus, multi-monitor).  
5. Reduced git noise by untracking large media/dataset.

### Gaps / follow-up needed

1. Electronics val set too small (49 images); Smart Phone class weak in that split.  
2. Initial electronics defaults were not production-safe (every-tick heavy YOLO, streak=1).  
3. Multi-face: FDDB accuracy ≠ production webcam FP rate; NMS/streak still required.  
4. Product UI for `electronics_visible` was thin; severity mapping incomplete in places.  
5. Dataset not in repo — cannot independently reproduce training without his local data.

### Optimization score (model work)

| Criterion | Score (1–5) | Note |
|-----------|-------------|------|
| Model training rigor | **4** | Real YOLO11n fine-tune + scripts |
| Evaluation discipline | **3.5** | FDDB + YOLO val; small electronics val |
| Runtime integration | **4** | Full dual-detector path |
| Production defaults / cost | **2.5** | Needed hardening |
| Spec alignment (AI + lockdown) | **4** | Strong on events; N/A on Azure |

**Overall assigned-task completion (AI + lockdown):** ≈ **75–85%**.

---

## 6. Branch comparison cheat sheet

| Topic | `final-proc` | `Arnav` |
|-------|--------------|---------|
| Phone detection | YOLO11n COCO | Same + electronics second model |
| Electronics / tablet | No | Yes (`electronics_yolo.pt`) |
| Face eval tooling | No | FDDB eval + findings |
| Multi-display lockdown | No | Yes |
| Window focus module | Inline blur/focus | Dedicated monitor |
| Commits beyond `final-proc` | — | `d19715a`, `aeab0e3` |

---

## 7. Confirmed completed pointers (checklist for manager)

Use this as the “assigned tasks” completion list:

- [x] Train / ship custom electronics detector (`electronics_yolo.pt`)  
- [x] Training + evaluation scripts and dataset contract  
- [x] Wire electronics into AI sidecar + monitor tick + persistence captions  
- [x] Dual-model inference helper (`infer_both_models.py`)  
- [x] Face-count benchmarking (FDDB) with written findings  
- [x] Window focus monitoring for lockdown  
- [x] Multiple-monitor detection signal  
- [x] Reduce large media/dataset tracking in git  
- [ ] Large holdout / real exam-camera electronics FP audit  
- [ ] Safe production defaults without follow-up hardening  
- [ ] Azure / Firebase / Twilio items from PDF (out of scope for this repo)

---

## 8. Recommendation

**Keep Arnav’s electronics model and lockdown focus/display work** — they are the clear unique value vs `final-proc`.  

**Merge selectively** into the main line: electronics runtime + lockdown monitors + training docs/weight; keep safe detector defaults (electronics off or high skip/conf/streak; face NMS + multi-face streak).  

**Do not** treat FDDB “90%+ exact count” as proof that multi-face false positives are solved on live exams without NMS.

---

*Sources: git diff `final-proc`…`Arnav`, `python/tools/findings.md`, electronics train `results.csv` / val excerpt, Technical Specification PDF §§4, 4.2, 13.3.*
