"""Fine-tune YOLOv8 on the Construction Site Safety dataset (transfer learning #1).

This IS the transfer learning: we start from COCO-pretrained yolov8n weights and
fine-tune on 10 construction-safety classes. ~2.7h for 100 epochs on a single
P100; a hackathon-usable model trains in far fewer epochs.

Usage:
    # 1. Download dataset (Kaggle CLI): kaggle datasets download -d \
    #    snehilsanyal/construction-site-safety-image-dataset-roboflow -p ../datasets --unzip
    # 2. python train_ppe.py --epochs 50 --model yolov8n.pt
Outputs runs/detect/train*/weights/best.pt -> copy to ../ppe_best.pt for serving.

Export to ONNX (permissive inference, avoids shipping AGPL ultralytics at runtime):
    yolo export model=ppe_best.pt format=onnx
"""
import argparse


def main():
    from ultralytics import YOLO

    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="yolov8n.pt", help="pretrained checkpoint (transfer base)")
    ap.add_argument("--data", default="data.yaml")
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    args = ap.parse_args()

    model = YOLO(args.model)  # transfer-learning base (COCO-pretrained)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=15,
        name="ppe_ft",
    )
    metrics = model.val()
    print("mAP50:", metrics.box.map50, "mAP50-95:", metrics.box.map)
    print("Copy runs/detect/ppe_ft/weights/best.pt -> ../ppe_best.pt")


if __name__ == "__main__":
    main()
