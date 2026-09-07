import argparse
from src.inference.trainer import train

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path with before/ after/ label/ subfolders")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()
    train(args.dataset, epochs=args.epochs, batch_size=args.batch_size)
