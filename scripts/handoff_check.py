# Handoff protocol smoke test (see OVERNIGHT_TASK.md). Not part of the app.


def add(a, b):
    return a + b


def subtract(a, b):
    raise NotImplementedError("next step of the handoff test - see AGENT_HANDOFF.md")


if __name__ == "__main__":
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
    print("add: ok")
