import logging
from export import paye_rti

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def main() -> None:
    paye_rti.run()


if __name__ == "__main__":
    main()
