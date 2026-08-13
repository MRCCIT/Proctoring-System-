model_selection = 0 & min_conf = .6:
{
  "images_evaluated": 2835,
  "exact_count_accuracy": 0.8046,
  "mean_absolute_error": 0.4053,
  "overcounted": 97,
  "undercounted": 457
}
Around 80% for real_faces <= 3

model_selection = 0 & min_conf = .5:
{
  "images_evaluated": 2590,
  "exact_count_accuracy": 0.868,
  "mean_absolute_error": 0.1514,
  "overcounted": 97,
  "undercounted": 245
}

model_selection = 1 & min_conf = .6:
{
  "images_evaluated": 2590,
  "exact_count_accuracy": 0.8826,
  "mean_absolute_error": 0.1336,
  "overcounted": 13,
  "undercounted": 291
}

model_selection = 1 & min_conf = .5:
{
  "images_evaluated": 2590,
  "exact_count_accuracy": 0.9066,
  "mean_absolute_error": 0.1058,
  "overcounted": 26,
  "undercounted": 216
}

model_selection = 1 & min_conf = .4:
{
  "images_evaluated": 2590,
  "exact_count_accuracy": 0.9131,
  "mean_absolute_error": 0.0981,
  "overcounted": 57,
  "undercounted": 168
}

model_selection = 1 & min_conf = .5 & IoU = .2:
{
  "images_evaluated": 2590,
  "exact_count_accuracy": 0.9035,
  "mean_absolute_error": 0.1089,
  "overcounted": 26,
  "undercounted": 224
}

IP Switching
Close open tabs
No Screenshots
Multiple Monitors
Talview

---

# Electronics YOLO evaluation (summary)

Validation results (per-class excerpt):

                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95)
                   all         49         49      0.952      0.652      0.916      0.751
           Smart Phone          4          4          1          0      0.781      0.658
                Tablet         44         44       0.91      0.955      0.972      0.798
                  iPad          1          1      0.948          1      0.995      0.796

Notes:
- `Tablet` class performs very well (high recall and precision) across the validation set.
- Has 91% Percision which is fairly good
