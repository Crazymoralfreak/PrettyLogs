import React, { useMemo, useState } from "react";
import { escapeHtml, highlightCode } from "../core/highlight";
import type { Payload } from "../core/pretty-format";
import { copyText } from "./display";
import { Icon } from "./icons";

interface PayloadBlockProps {
  payload: Payload;
}

function PayloadBlock({ payload }: PayloadBlockProps): React.ReactElement {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const source = raw ? payload.raw : payload.pretty;
  const html = useMemo(
    () => (raw && payload.kind === "logfmt" ? escapeHtml(source) : highlightCode(source, payload.lang)),
    [raw, source, payload.kind, payload.lang],
  );

  const copy = (): void => {
    void copyText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="pl-payload">
      <div className="pl-payload-head">
        <span className="pl-payload-kind">{payload.label}</span>
        <span className="pl-spacer" />
        <button type="button" className={`pl-link${raw ? "" : " pl-link-active"}`} onClick={() => setRaw(false)}>
          Pretty
        </button>
        <button type="button" className={`pl-link${raw ? " pl-link-active" : ""}`} onClick={() => setRaw(true)}>
          Raw
        </button>
        <button type="button" className="pl-icon-btn" title="Копировать" onClick={copy}>
          <Icon name="copy" size={13} />
          {copied ? <span className="pl-copied">скопировано</span> : null}
        </button>
      </div>
      <pre className="pl-code">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

interface PrettyPanelProps {
  payloads: Payload[];
}

/** Formatted and syntax highlighted view of the structured data found in a log entry. */
export function PrettyPanel({ payloads }: PrettyPanelProps): React.ReactElement {
  return (
    <div className="pl-pretty">
      {payloads.map(payload => (
        <PayloadBlock key={`${payload.kind}-${payload.start}`} payload={payload} />
      ))}
    </div>
  );
}
