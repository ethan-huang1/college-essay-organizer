# Handoff protocol smoke test (see OVERNIGHT_TASK.md). Not part of the app.


def add(a, b):
    return a + b


def subtract(a, b):
    return a - b


if __name__ == "__main__":
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
    print("add: ok")
    assert subtract(5, 3) == 2
    assert subtract(-1, 1) == -2
    print("subtract: ok")
