import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { MemoryRouter, Link, useNavigate } from "react-router-dom";
import { Modal } from "../../src/shared/Modal";

HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = true;
});
HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
  this.open = false;
  this.dispatchEvent(new Event("close"));
});

function withRouter(children: ReactNode) {
  return <MemoryRouter initialEntries={["/list"]}>{children}</MemoryRouter>;
}

describe("Modal", () => {
  it("renders title and children when open", () => {
    render(
      withRouter(
        <Modal open title="Test Dialog" onClose={() => undefined}>
          <p>Modal content</p>
        </Modal>,
      ),
    );
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      withRouter(
        <Modal open={false} title="Hidden" onClose={() => undefined}>
          <p>Hidden content</p>
        </Modal>,
      ),
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      withRouter(
        <Modal open title="Dialog" onClose={onClose}>
          <p>Content</p>
        </Modal>,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      withRouter(
        <Modal open title="Dialog" onClose={onClose}>
          <p>Content</p>
        </Modal>,
      ),
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has accessible dialog role and aria-labelledby", () => {
    render(
      withRouter(
        <Modal open title="Accessible Dialog" onClose={() => undefined}>
          <p>Content</p>
        </Modal>,
      ),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");
  });

  it("auto-closes when the route changes while the modal is open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Harness() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate("/radar")}>Navigate</button>
          <Modal open title="Stuck Dialog" onClose={onClose}>
            <p>Content</p>
          </Modal>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={["/list"]}>
        <Harness />
      </MemoryRouter>,
    );
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Navigate" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop pointerdown closes the modal and forwards the click to the anchor under the cursor", () => {
    const onClose = vi.fn();
    const targetClick = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <a
            href="#somewhere"
            data-testid="under-link"
            onClick={(e) => {
              e.preventDefault();
              targetClick();
            }}
          >
            Hidden NavLink
          </a>
          <Modal
            open={open}
            title="Dialog"
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          >
            <p>Content</p>
          </Modal>
        </>
      );
    }
    render(withRouter(<Harness />));
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    const link = screen.getByTestId("under-link");
    const linkRect = link.getBoundingClientRect();
    // jsdom returns 0×0 rects; pin elementFromPoint to the link.
    (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => link;
    fireEvent.mouseDown(dialog, {
      button: 0,
      clientX: linkRect.left + 1,
      clientY: linkRect.top + 1,
    });
    expect(onClose).toHaveBeenCalled();
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(targetClick).toHaveBeenCalled();
        resolve();
      });
    });
  });
});

// Also keep a sibling test for the Link variant, just to prove the anchor
// detection works through Router's Link component too.
describe("Modal backdrop click forwarding", () => {
  it("targets the underlying React Router Link", () => {
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Link to="/radar" data-testid="under-link">
            Radar
          </Link>
          <Modal
            open={open}
            title="Dialog"
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          >
            <p>Content</p>
          </Modal>
        </>
      );
    }
    render(withRouter(<Harness />));
    const link = screen.getByTestId("under-link");
    const clickSpy = vi.spyOn(link, "click");
    (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => link;
    fireEvent.mouseDown(screen.getByRole("dialog"), {
      button: 0,
      clientX: 1,
      clientY: 1,
    });
    expect(onClose).toHaveBeenCalled();
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(clickSpy).toHaveBeenCalled();
        resolve();
      });
    });
  });
});
