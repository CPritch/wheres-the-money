import logging
from export import flows

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def main() -> None:
    flows.run()


if __name__ == "__main__":
    main()
