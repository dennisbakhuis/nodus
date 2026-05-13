import { Button } from "../shared/Button";
import { useHelp } from "./HelpContext";

export function HelpButton() {
  const { open, toggle, triggerRef } = useHelp();
  return (
    <Button
      ref={triggerRef}
      type="button"
      variant="header"
      size="xs"
      active={open}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={toggle}
      title="Show help for the current page"
    >
      Help
    </Button>
  );
}
