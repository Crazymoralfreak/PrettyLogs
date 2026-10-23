import React, { useEffect, useRef, useState } from "react";

interface TriggerState {
  open: boolean;
  toggle: () => void;
}

interface PopoverProps {
  trigger: (state: TriggerState) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
}

/** Dropdown panel that closes on outside click and Escape. */
export function Popover({ trigger, children, align = "left", panelClassName = "" }: PopoverProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onMouseDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="pl-popover" ref={rootRef}>
      {trigger({ open, toggle: () => setOpen(value => !value) })}
      {open ? <div className={`pl-popover-panel pl-align-${align} ${panelClassName}`}>{children(() => setOpen(false))}</div> : null}
    </div>
  );
}
